import {getToolName, isToolUIPart, jsonSchema, tool, toolSearch, type ModelMessage, type Tool, type ToolSet} from "ai";
import {editorTools} from "@type32/codemirror-rich-obsidian-editor/ext/ai/tools";
import type {ChatMode, ChatScope, VertexChatMessage} from "#shared/types/app/chats";
import {webFetch} from "~/utils/webPage";

/** A file or folder in the workspace, workspace-relative; `kind` is its extension (lowercase) or `folder`. */
export interface WorkspaceEntry {
    path: string
    kind: string
}

/** What the note tools reach in the workspace; `useChats` binds them to a session. */
export interface NoteToolDeps {
    /** Notes whose path or text matches (Rust `notes_search`). */
    search: (query: string) => Promise<{ path: string, snippet: string | null }[]>
    /** A note's text by workspace-relative path (the open editor's buffer when it's mounted); `null` when there's none. */
    read: (path: string) => Promise<string | null>
    /** The workspace-relative path of the note open in the editor, for `readNote` without a path. */
    openNote?: () => string | undefined
    /** Shows the note at `path` (or by name) in an editor tab beside the chat; returns what the model gets back. */
    openInEditor?: (path: string) => Promise<object>
    /** Sites (`hostname`s) the user allowed `fetchUrl` for in this chat: no approval asked. */
    allowedHost?: (host: string) => boolean
    /** Workspace-relative paths of the notes under `folder` (`''` = all). */
    list: (folder: string) => string[]
    /** Every file and folder in the workspace but dot-named ones. */
    files: () => WorkspaceEntry[]
    /** The chat's mode: a tool made for another one refuses (see {@link modeError}). */
    mode: ChatMode
    /**
     * Write mode: stages `markdown` as the note's new text (`create`: a new note at `path`). Checks the path and the
     * scope; returns what the model gets back.
     */
    stage?: (path: string, markdown: string, create: boolean) => Promise<object>
    /** Runs the workflow at `path` (or by name) on `note`, for real or `dry`; returns what the model gets back. */
    runWorkflow?: (path: string, note: string | undefined, dry: boolean) => Promise<object>
    /**
     * Runs a command in the reply's sandbox (`chatBash.ts`); in Write mode, also stages what it wrote. Returns what the
     * model gets back.
     */
    bash?: (command: string, signal?: AbortSignal) => Promise<object>
}

/** `askUser`'s questions; see the tool's schema. */
export interface AskUserInput {
    questions: { question: string, options?: { label: string, description?: string }[], multiple?: boolean }[]
}

/**
 * `askUser`'s result: the answers from its card (several picked options as a list), a reply typed in the prompt
 * instead (with what it attached), or skipped.
 */
export type AskUserOutput =
    | { answers: { question: string, answer: string | string[] }[] }
    | { reply: string, notes?: string[], folders?: string[] }
    | { skipped: true }

const NOTE_READ_CHARS = 20_000
const LIST_LIMIT = 200
/** Named for what it does: a model told to "search" passes it the user's topic instead of a tool's. */
const FIND_TOOLS = 'findTools'
/** Always sent loaded: a question shouldn't cost a tool search first. */
export const ASK_USER = 'askUser'
/** Listed after every other match: the note tools do most things better. */
const BASH = 'bash'

const MODE_NAMES: Record<ChatMode, string> = {read: 'Read', suggest: 'Suggest', write: 'Write'}

/** The tools made for one mode; every other tool works in any. */
const MODE_OF: Partial<Record<string, ChatMode>> = {
    proposeEdit: 'suggest', proposeInsert: 'suggest', createNote: 'write', writeNote: 'write', editNote: 'write',
}
/** What does the same in another mode, by tool and mode. */
const INSTEAD: Partial<Record<string, Partial<Record<ChatMode, string>>>> = {
    proposeEdit: {write: 'editNote'},
    proposeInsert: {write: 'editNote'},
    editNote: {suggest: 'proposeEdit'},
    writeNote: {suggest: 'proposeEdit'},
}

/** Why tool `name` can't run in `mode`, worded for the model with what to do instead; `undefined` when it can. */
export function modeError(name: string, mode: ChatMode): { error: string } | undefined {
    const needs = MODE_OF[name]
    if (!needs || needs === mode) return undefined
    const instead = INSTEAD[name]?.[mode]
    return {
        error: `${name} only works in ${MODE_NAMES[needs]} mode, and this chat is in ${MODE_NAMES[mode]} mode. `
            + (instead ? `Use ${instead} instead.`
                : mode === 'read' ? 'Read mode can\'t change notes: ask the user to switch the chat to Suggest or Write mode.'
                    : `Ask the user to switch the chat to ${MODE_NAMES[needs]} mode.`),
    }
}

/**
 * The messages as the model sees them: a user message sent in another mode than the one before it starts by saying
 * so, as a history of one mode's tool calls otherwise outweighs the system prompt's word for the new one.
 */
export function markModeSwitches(messages: VertexChatMessage[]): VertexChatMessage[] {
    let previous: ChatMode | undefined
    return messages.map(m => {
        const mode = m.role === 'user' ? m.metadata?.mode : undefined
        if (!mode) return m
        const switched = previous !== undefined && previous !== mode
        previous = mode
        return switched ? {...m, parts: [{type: 'text', text: `(The user switched this chat to ${MODE_NAMES[mode]} mode.)`}, ...m.parts]} : m
    })
}

const MODES = 'A chat has three modes, which only the user switches: Read (read notes, change nothing), Suggest (propose '
    + 'edits the user accepts or rejects one by one in the editor) and Write (stage changes and new notes, which the user '
    + 'reviews and applies after your reply).'

/** The system prompt's part on the tools (when sent), the mode and the scope (in {@link scopeText}'s words). */
export function toolsPrompt(mode: ChatMode, scope: string, tools: boolean): string {
    const current = `This chat is in ${MODE_NAMES[mode]} mode.`
    if (!tools) return `${current} ${MODES} You have no tools in this chat, so you can't read or change notes beyond the ones given to you here.`
    const rule = mode === 'read'
        ? 'You can read notes but not change them. If the user wants a change, tell them to switch the chat to Suggest or Write mode.'
        : mode === 'write'
            ? 'Your changes are staged, not applied: after your reply the user reviews them and applies the ones they want, so say '
            + `what you changed. You may change ${scope}; notes you create count as named in this chat.`
            : 'Edits are only proposed: the user accepts or rejects each one, and the result tells you which. You may propose '
            + `edits to ${scope}. To edit a note that isn't open, pass its path.`
    // Tools first: small models lose the tool search behind the mode's wording and call made-up tools.
    return [
        'You can use tools on the user\'s notes. They load on demand: first call `findTools` with what you want to do (for '
        + 'example "search notes", "find files", "read note", "edit a note", "run a workflow", "fetch a web page" or "run a bash '
        + `command"), then call the tools it returns. Only \`findTools\` and \`${ASK_USER}\` can be called without searching first. `
        + 'Prefer the note tools: the sandboxed shell over the workspace (search "run a bash command") is for what they can\'t '
        + 'do, like counting across many notes or changing many files at once.',
        current,
        rule,
        `${MODES} A tool whose description names a mode only works in that mode.`,
        `When you need a decision or missing information from the user before you can go on, call \`${ASK_USER}\` instead of `
        + 'asking in your reply, and don\'t end a reply with a question you could have asked with it.',
    ].join(' ')
}

/** The named scope: notes by path, and folders whose notes all count. */
export interface NamedNotes {
    notes: string[]
    folders: string[]
}

/** Whether a chat with `scope` may change the note at `path` (workspace-relative). */
export function inScope(path: string, scope: ChatScope | undefined, named: NamedNotes): boolean {
    const within = (folder: string) => path.startsWith(`${folder}/`)
    if (scope?.kind === 'workspace') return true
    if (scope?.kind === 'folder') return within(scope.path)
    return named.notes.includes(path) || named.folders.some(within)
}

/** The scope in words, for the system prompt and out-of-scope errors. */
export function scopeText(scope: ChatScope | undefined, named: NamedNotes): string {
    if (scope?.kind === 'workspace') return 'any note in the workspace'
    if (scope?.kind === 'folder') return `the notes in the folder "${scope.path}" and its subfolders`
    const names = [...named.notes.map(p => `"${p}"`), ...named.folders.map(f => `the notes in "${f}/"`)]
    return names.length
        ? `only the notes named in this chat: ${names.join(', ')}`
        : 'no notes yet (the user names one by opening or attaching it)'
}

/**
 * Tools whose name or description share a word with `query`, best first, the ones made for another mode than `mode`
 * after them and `bash` last; every tool when none match. There are only a few, and a model that searched with the wrong words should still
 * find them.
 */
export function rankTools({query, tools}: { query: string, tools: { name: string, description?: string }[] }, mode?: ChatMode): string[] {
    // Plurals as singulars: "workflows" finds the tool that lists workflows.
    const words = (text: string): string[] => (text.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .map(w => w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
    const asked = [...new Set(words(query))]
    const scored = tools.map(t => {
        const name = words(t.name)
        const description = words(t.description ?? '')
        // Like the AI SDK's default: a word in the name counts double.
        return {
            name: t.name,
            score: asked.reduce((sum, w) => sum + (name.includes(w) ? 2 : 0) + (description.includes(w) ? 1 : 0), 0),
            // Another mode's tools after this mode's, and bash after both.
            later: Number(!!mode && !!MODE_OF[t.name] && MODE_OF[t.name] !== mode) + Number(t.name === BASH) * 2,
        }
    })
    const matched = scored.filter(s => s.score > 0)
    return (matched.length ? matched : scored).sort((a, b) => a.later - b.later || b.score - a.score).map(s => s.name)
}

const pathInput = (description: string) => jsonSchema<{ path: string }>({
    type: 'object', properties: {path: {type: 'string', description}}, required: ['path'], additionalProperties: false,
})

const NOTE_PATH = {type: 'string', description: 'The note to change: its workspace-relative path or name. Omit for the open document.'} as const
const NOT_FOUND = (path: string) => `There's no note at "${path}". Use searchNotes or findFiles for its path.`

/**
 * `readNote`'s lines `start`–`end` of `text` (1-based, inclusive; default all), ending at a whole line before `cap`
 * characters, with the note's line count. `truncated` when lines were left out for the cap.
 */
export function readLines(text: string, start = 1, end?: number, cap = NOTE_READ_CHARS) {
    const lines = text.split('\n')
    const totalLines = lines.length
    const from = Math.max(1, Math.floor(start))
    if (from > totalLines) return {error: `startLine ${from} is past the end: the note has ${totalLines} lines.`}
    const to = Math.min(totalLines, Math.max(from, Math.floor(end ?? totalLines)))
    let last = from
    let size = lines[from - 1]!.length
    while (last < to && size + 1 + lines[last]!.length <= cap) size += 1 + lines[last++]!.length
    // ponytail: one line longer than the cap is cut, and its rest can't be read; page by characters if notes have such lines.
    const markdown = lines.slice(from - 1, last).join('\n').slice(0, cap)
    return {markdown, startLine: from, endLine: last, totalLines, ...((last < to || size > cap) && {truncated: true as const})}
}

/** A URL's `hostname`, `''` when it doesn't parse (which never counts as allowed). */
export const hostnameOf = (url: string) => {
    try {
        return new URL(url).hostname
    } catch {
        return ''
    }
}

/** `url` without its `#fragment` (never sent), normalized; `undefined` when it doesn't parse. */
function bareUrl(url: string) {
    try {
        const parsed = new URL(url)
        parsed.hash = ''
        return parsed.href
    } catch {
        return undefined
    }
}

/**
 * Whether the user wrote `url` in one of their messages (trailing punctuation aside): then fetching it is their ask,
 * not the model's. Only user messages count, as the model writes everything else.
 */
export function urlInUserMessages(url: string, messages: ModelMessage[]): boolean {
    const wanted = bareUrl(url)
    if (!wanted) return false
    const texts = messages.flatMap(m => m.role !== 'user' ? [] : typeof m.content === 'string' ? [m.content] : m.content.flatMap(p => p.type === 'text' ? [p.text] : []))
    return texts.some(text => [...text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)]
        .some(([found]) => bareUrl(found) === wanted || bareUrl(found.replace(/[.,;:!?)\]}]+$/, '')) === wanted))
}

/**
 * The editor package's tools, the proposals also taking the note to change (`path`; it opens beside the chat, where
 * the user decides). They have no `execute`: `useChats` runs them in the editor, after {@link modeError}.
 * `readSelection` stays on the open document, without showing it; reading the open note is `readNote` without a path.
 */
const editorToolSet: ToolSet = {
    readSelection: editorTools.readSelection,
    proposeEdit: tool({
        description: 'Suggest mode: propose replacing one passage of a note (the open document unless `path` names another). The user reviews the change and accepts or rejects it; the note only changes if they accept. The result tells you which.',
        inputSchema: jsonSchema<{ path?: string, find: string, replace: string }>({
            type: 'object',
            properties: {
                path: NOTE_PATH,
                find: {type: 'string', description: 'The passage to replace, copied verbatim from the note. Must occur exactly once.'},
                replace: {type: 'string', description: 'The new Markdown text.'},
            },
            required: ['find', 'replace'],
            additionalProperties: false,
        }),
    }),
    proposeInsert: tool({
        description: 'Suggest mode: propose inserting new text into a note (the open document unless `path` names another). The user reviews it and accepts or rejects it. Start `text` with a blank line ("\\n\\n") to add it as a new paragraph.',
        inputSchema: jsonSchema<{ path?: string, text: string, after?: string }>({
            type: 'object',
            properties: {
                path: NOTE_PATH,
                text: {type: 'string', description: 'The Markdown text to insert.'},
                after: {type: 'string', description: 'Insert right after this passage, copied verbatim; it must occur exactly once. Omit to insert at the user\'s cursor in the open document, or at the end of another note.'},
            },
            required: ['text'],
            additionalProperties: false,
        }),
    }),
}

const markdownInput = (path: string) => jsonSchema<{ path: string, markdown: string }>({
    type: 'object',
    properties: {path: {type: 'string', description: path}, markdown: {type: 'string', description: 'The note\'s whole Markdown.'}},
    required: ['path', 'markdown'],
    additionalProperties: false,
})

/** Write mode's tools: each stages a change (see {@link NoteToolDeps.stage}), which the user applies after the reply. */
const writeTools = (deps: NoteToolDeps): ToolSet => {
    const stage = deps.stage ?? (async () => ({error: 'This chat can\'t change notes.'}))
    return {
        createNote: tool({
            description: 'Write mode: create a new note. Staged: the user reviews it after your reply and applies it if they want.',
            inputSchema: markdownInput('Workspace-relative path of the new note, e.g. "Folder/Note.md"; missing folders are created.'),
            execute: ({path, markdown}) => stage(path, markdown, true),
        }),
        writeNote: tool({
            description: 'Write mode: replace a note\'s whole Markdown, e.g. to rewrite or restructure it. Staged like every change.',
            inputSchema: markdownInput('Workspace-relative path or name of the note.'),
            execute: ({path, markdown}) => stage(path, markdown, false),
        }),
        editNote: tool({
            description: 'Write mode: replace one passage of a note (after your earlier staged changes to it). Staged like every change.',
            inputSchema: jsonSchema<{ path: string, find: string, replace: string }>({
                type: 'object',
                properties: {
                    path: {type: 'string', description: 'Workspace-relative path or name of the note.'},
                    find: {type: 'string', description: 'The passage to replace, copied verbatim from the note. Must occur exactly once.'},
                    replace: {type: 'string', description: 'The new Markdown text.'},
                },
                required: ['path', 'find', 'replace'],
                additionalProperties: false,
            }),
            execute: async ({path, find, replace}) => {
                const text = await deps.read(path)
                if (text === null) return {error: NOT_FOUND(path)}
                const at = find ? text.indexOf(find) : -1
                if (at < 0) return {error: 'Passage not found. Copy it exactly as it appears in the note (see readNote).'}
                if (text.indexOf(find, at + 1) >= 0) return {error: 'Passage occurs more than once. Include more surrounding words so it matches exactly once.'}
                return stage(path, text.slice(0, at) + replace + text.slice(at + find.length), false)
            },
        }),
    }
}

const askUser = tool({
    description: 'Ask the user one or more questions and wait for their answers, which come back as this tool\'s result: to choose between options, confirm a plan, or fill in details you need before you can go on. Use it instead of asking in your reply. The user may also skip.',
    inputSchema: jsonSchema<AskUserInput>({
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                minItems: 1,
                maxItems: 4,
                items: {
                    type: 'object',
                    properties: {
                        question: {type: 'string', description: 'One question.'},
                        options: {
                            type: 'array',
                            maxItems: 6,
                            description: 'Answers to pick from; the user can always write their own instead. Omit for an open question.',
                            items: {
                                type: 'object',
                                properties: {
                                    label: {type: 'string', description: 'A short answer, 1 to 5 words.'},
                                    description: {type: 'string', description: 'What picking it means, when the label doesn\'t say.'},
                                },
                                required: ['label'],
                                additionalProperties: false,
                            },
                        },
                        multiple: {type: 'boolean', description: 'Whether the user may pick several options.'},
                    },
                    required: ['question'],
                    additionalProperties: false,
                },
            },
        },
        required: ['questions'],
        additionalProperties: false,
    }),
})

/** Only `execute` tools: a tool made for another mode answers with {@link modeError} instead of running. */
function gated(name: string, t: Tool, mode: ChatMode): Tool {
    const run = t.execute
    if (!run || !MODE_OF[name]) return t
    return {...t, execute: (input, options) => modeError(name, mode) ?? run(input, options)}
}

/**
 * The chat's tools, the same in every mode: one made for a mode says so and refuses in the others
 * ({@link modeError}). Every tool but `findTools` (the AI SDK's tool search) and `askUser` is deferred, so the model
 * loads only what it looks for, except the ones this conversation already used or found (`used`): discovery lasts one
 * generation, and an edit's Accept/Reject starts the next.
 */
export function chatTools(deps: NoteToolDeps, used: ReadonlySet<string>): ToolSet {
    const tools: ToolSet = {
        searchNotes: tool({
            description: 'Search the user\'s notes: file paths and text containing a word or phrase (case-insensitive). Returns up to 20 paths, each with a snippet around the match.',
            inputSchema: jsonSchema<{ query: string }>({
                type: 'object', properties: {query: {type: 'string', description: 'A word or short phrase.'}}, required: ['query'], additionalProperties: false,
            }),
            execute: ({query}) => deps.search(query),
        }),
        readNote: tool({
            description: 'Read a note\'s Markdown by its workspace-relative path (as searchNotes or findFiles return it) or its name; '
                + 'without `path`, the note open in the editor. Returns the lines read and the note\'s line count. A long note comes in '
                + 'parts: when the result says `truncated`, read on with startLine = its endLine + 1. Reading doesn\'t show the note to '
                + 'the user (openInEditorTab does).',
            inputSchema: jsonSchema<{ path?: string, startLine?: number, endLine?: number }>({
                type: 'object',
                properties: {
                    path: {type: 'string', description: 'Workspace-relative path, e.g. "Folder/Note.md", or a note\'s name, e.g. "Note". Omit for the note open in the editor.'},
                    startLine: {type: 'integer', minimum: 1, description: 'The first line to read (1-based). Default 1.'},
                    endLine: {type: 'integer', minimum: 1, description: 'The last line to read, included. Default: the end of the note.'},
                },
                additionalProperties: false,
            }),
            execute: async ({path, startLine, endLine}) => {
                const asked = path ?? deps.openNote?.()
                if (!asked) return {error: 'No note is open in the editor. Pass the `path` of the note to read.'}
                let found = asked
                let text = await deps.read(asked)
                // Models pass partial names ("2-3" for "Note 2-3"): one note containing it is the one meant.
                const near = text === null ? deps.list('').filter(p => p.toLowerCase().includes(asked.toLowerCase().replace(/\.(md|txt)$/, ''))) : []
                if (near.length === 1) text = await deps.read(found = near[0]!)
                if (text === null) {
                    return {error: near.length ? `There's no note at "${asked}". Did you mean one of: ${near.slice(0, 5).join(', ')}?` : NOT_FOUND(asked)}
                }
                const lines = readLines(text, startLine, endLine)
                return 'error' in lines ? lines : {path: found, ...lines}
            },
        }),
        openInEditorTab: tool({
            description: 'Open a note in an editor tab beside the chat, to show it to the user. It doesn\'t read the note (use readNote) or change it.',
            inputSchema: pathInput('Workspace-relative path, e.g. "Folder/Note.md", or a note\'s name.'),
            execute: ({path}) => deps.openInEditor ? deps.openInEditor(path) : {error: 'Notes can\'t be opened from this chat.'},
        }),
        fetchUrl: tool({
            description: `${webFetch.description} The user approves the first fetch from each site, unless they wrote the URL `
                + 'in a message. Addresses on the user\'s computer or local network are refused.',
            inputSchema: webFetch.inputSchema,
            needsApproval: ({url}, {messages}) => !deps.allowedHost?.(hostnameOf(url)) && !urlInUserMessages(url, messages),
            execute: webFetch.execute,
            toModelOutput: webFetch.toModelOutput,
        }),
        findFiles: tool({
            description: 'Find files and folders in the workspace by name, of any type (notes, images, PDFs, bases, canvases, workflows), or list a folder. Returns workspace-relative paths with their kind (the extension, or "folder"). To search the text of notes, use searchNotes.',
            inputSchema: jsonSchema<{ query?: string, folder?: string, extension?: string }>({
                type: 'object',
                properties: {
                    query: {type: 'string', description: 'Part of the path or name, any case. Omit to list everything under `folder`.'},
                    folder: {type: 'string', description: 'Workspace-relative folder to look in, subfolders included; omit for the whole workspace.'},
                    extension: {type: 'string', description: 'Only this kind, e.g. "md", "pdf", "workflow", or "folder".'},
                },
                additionalProperties: false,
            }),
            execute: ({query, folder, extension}) => {
                const dir = (folder ?? '').replace(/^\/+|\/+$/g, '')
                const words = query?.toLowerCase()
                const kind = extension?.replace(/^\./, '').toLowerCase()
                const found = deps.files().filter(f => (!dir || f.path.startsWith(`${dir}/`))
                    && (!words || f.path.toLowerCase().includes(words)) && (!kind || f.kind === kind))
                return {files: found.slice(0, LIST_LIMIT), more: Math.max(0, found.length - LIST_LIMIT)}
            },
        }),
        ...editorToolSet,
        ...writeTools(deps),
        runWorkflow: tool({
            description: 'Run one of the user\'s workflows (a .workflow file; list them with findFiles, extension "workflow"). With dryRun it changes nothing and returns what it would change, in any mode. A real run only works in Write mode and changes notes directly, without staging; the user is asked to approve it, so don\'t ask them yourself.',
            inputSchema: jsonSchema<{ path: string, note?: string, dryRun?: boolean }>({
                type: 'object',
                properties: {
                    path: {type: 'string', description: 'The workflow\'s workspace-relative path or name.'},
                    note: {type: 'string', description: 'The note it runs on, for workflows that use the current note; omit for the open one.'},
                    dryRun: {type: 'boolean', description: 'Only report what it would change.'},
                },
                required: ['path'],
                additionalProperties: false,
            }),
            needsApproval: ({dryRun}) => !dryRun && deps.mode === 'write',
            execute: async ({path, note, dryRun}) => {
                if (!dryRun && deps.mode !== 'write') {
                    return {error: `A real run only works in Write mode, and this chat is in ${MODE_NAMES[deps.mode]} mode. Pass dryRun to see what it would change, or ask the user to switch the chat to Write mode.`}
                }
                return deps.runWorkflow ? deps.runWorkflow(path, note, !!dryRun) : {error: 'Workflows can\'t run in this chat.'}
            },
        }),
        [BASH]: tool({
            description: 'Run a bash command in a sandbox, for what the other tools can\'t do: counting or aggregating across many '
                + 'notes, regex searches with context, transforming many files at once, jq or awk on data. Prefer searchNotes, '
                + 'readNote, findFiles and the edit tools otherwise. The workspace\'s text files are at /workspace, the working '
                + 'directory (hidden folders left out); /tmp is scratch space. grep, sed, awk, jq, find, sort, uniq, wc, diff, '
                + 'xargs and other common commands are built in; there is no network, no python or node, and a command stops after '
                + '10 s. Files stay between commands of the same reply. In Write mode, the files a command changes or creates under '
                + '/workspace (new ones must end in .md) are staged like writeNote, for the user to review; a deletion isn\'t staged, '
                + 'and a move stages only the new file. In Read and Suggest mode nothing reaches the notes.',
            inputSchema: jsonSchema<{ command: string }>({
                type: 'object', properties: {command: {type: 'string', description: 'The bash command or script.'}}, required: ['command'], additionalProperties: false,
            }),
            execute: ({command}, {abortSignal}) => deps.bash ? deps.bash(command, abortSignal) : {error: 'Commands can\'t run in this chat.'},
        }),
    }
    const deferred = Object.entries(tools).map(([name, t]) => [name, used.has(name) ? gated(name, t, deps.mode) : {...gated(name, t, deps.mode), deferLoading: true}])
    return {
        [FIND_TOOLS]: toolSearch({search: input => rankTools(input, deps.mode), maxResults: Object.keys(tools).length}),
        [ASK_USER]: askUser,
        ...Object.fromEntries(deferred),
    }
}

/** Tools this conversation called, and the ones its tool searches found. */
export function usedToolNames(messages: VertexChatMessage[]): Set<string> {
    const names = new Set<string>()
    for (const part of messages.flatMap(m => m.parts)) {
        if (!isToolUIPart(part)) continue
        const name = getToolName(part)
        if (name !== FIND_TOOLS) names.add(name)
        else if (part.state === 'output-available') {
            const found = (part.output as { tools?: { name?: unknown }[] } | undefined)?.tools ?? []
            for (const t of found) if (typeof t.name === 'string') names.add(t.name)
        }
    }
    return names
}

/** Whether a provider error says the model can't take tools (Ollama, OpenRouter, vLLM, LM Studio phrasings). */
export function toolsUnsupported(message: string): boolean {
    return /does not support tools|doesn'?t support tools|support tool use|tool choice requires|(?:tools?|function calling|tool calling) (?:is |are )?not supported|does not support (?:function|tool) calling/i.test(message)
}
