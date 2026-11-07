import {getToolName, isToolUIPart, jsonSchema, tool, toolSearch, type ToolSet} from "ai";
import {editorTools} from "@type32/codemirror-rich-obsidian-editor/ext/ai/tools";
import type {ChatMode, ChatScope, VertexChatMessage} from "#shared/types/app/chats";

/** What the note tools reach in the workspace; `useChats` binds them to a session. */
export interface NoteToolDeps {
    /** Notes whose path or text matches (Rust `notes_search`). */
    search: (query: string) => Promise<{ path: string, snippet: string | null }[]>
    /** A note's text by workspace-relative path (the open editor's buffer when it's mounted); `null` when there's none. */
    read: (path: string) => Promise<string | null>
    /** Workspace-relative paths of the notes under `folder` (`''` = all). */
    list: (folder: string) => string[]
    /** Suggest: the editor tools come too (read the open note, propose edits). Write: the staging tools (`stage`). */
    mode: ChatMode
    /**
     * Write mode: stages `markdown` as the note's new text (`create`: a new note at `path`). Checks the path and the
     * scope; returns what the model gets back.
     */
    stage?: (path: string, markdown: string, create: boolean) => Promise<object>
}

const NOTE_READ_CHARS = 20_000
const LIST_LIMIT = 200
/** Named for what it does: a model told to "search" passes it the user's topic instead of a tool's. */
const FIND_TOOLS = 'findTools'

/** Added to the system prompt when tools are sent; `scope` is {@link scopeText}'s. */
export function toolsPrompt(mode: ChatMode, scope: string): string {
    const find = 'You can use tools on the user\'s notes. Your tools load on demand: call `findTools` with what you want to do (for example "search notes", "read note", "list notes"'
    if (mode === 'ask') {
        return `${find}), then call the tools it returns. This chat is in Ask mode: you can read notes but not change them. `
            + 'If the user wants a change, tell them to switch the chat to Suggest or Write mode.'
    }
    if (mode === 'write') {
        return `${find}, "create a note", "write a note" or "edit a note"), then call the tools it returns. Your changes `
            + 'are staged, not applied: after your reply the user reviews them and applies the ones they want, so say what '
            + `you changed. You may change ${scope}; notes you create count as named in this chat.`
    }
    return `${find}, "read the open document" or "edit a note"), then call the tools it returns. Edits are only proposed: `
        + `the user accepts or rejects each one, and the result tells you which. You may propose edits to ${scope}. `
        + 'To edit a note that isn\'t open, pass its path.'
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
 * Tools whose name or description share a word with `query`, best first; every tool when none do. There are only a
 * few, and a model that searched with the wrong words should still find them.
 */
export function rankTools({query, tools}: { query: string, tools: { name: string, description?: string }[] }): string[] {
    const words = (text: string): string[] => text.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
    const asked = [...new Set(words(query))]
    const scored = tools.map(t => {
        const name = words(t.name)
        const description = words(t.description ?? '')
        // Like the AI SDK's default: a word in the name counts double.
        return {name: t.name, score: asked.reduce((sum, w) => sum + (name.includes(w) ? 2 : 0) + (description.includes(w) ? 1 : 0), 0)}
    })
    const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)
    return (matched.length ? matched : scored).map(s => s.name)
}

const pathInput = (description: string) => jsonSchema<{ path: string }>({
    type: 'object', properties: {path: {type: 'string', description}}, required: ['path'], additionalProperties: false,
})

const NOTE_PATH = {type: 'string', description: 'The note to change: its workspace-relative path or name. Omit for the open document.'} as const

/**
 * The editor package's tools, the proposals also taking the note to change (`path`; it opens beside the chat, where
 * the user decides). They have no `execute`: `useChats` runs them in the editor. `readDocument` and `readSelection`
 * stay on the open document.
 */
const suggestTools: ToolSet = {
    readDocument: editorTools.readDocument,
    readSelection: editorTools.readSelection,
    proposeEdit: tool({
        description: 'Propose replacing one passage of a note (the open document unless `path` names another). The user reviews the change and accepts or rejects it; the note only changes if they accept. The result tells you which.',
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
        description: 'Propose inserting new text into a note (the open document unless `path` names another). The user reviews it and accepts or rejects it. Start `text` with a blank line ("\\n\\n") to add it as a new paragraph.',
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
            description: 'Create a new note. Staged: the user reviews it after your reply and applies it if they want.',
            inputSchema: markdownInput('Workspace-relative path of the new note, e.g. "Folder/Note.md"; missing folders are created.'),
            execute: ({path, markdown}) => stage(path, markdown, true),
        }),
        writeNote: tool({
            description: 'Replace a note\'s whole Markdown, e.g. to rewrite or restructure it. Staged like every change.',
            inputSchema: markdownInput('Workspace-relative path or name of the note.'),
            execute: ({path, markdown}) => stage(path, markdown, false),
        }),
        editNote: tool({
            description: 'Replace one passage of a note (after your earlier staged changes to it). Staged like every change.',
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
                if (text === null) return {error: `There's no note at "${path}". Use searchNotes or listNotes for its path.`}
                const at = find ? text.indexOf(find) : -1
                if (at < 0) return {error: 'Passage not found. Copy it exactly as it appears in the note (see readNote).'}
                if (text.indexOf(find, at + 1) >= 0) return {error: 'Passage occurs more than once. Include more surrounding words so it matches exactly once.'}
                return stage(path, text.slice(0, at) + replace + text.slice(at + find.length), false)
            },
        }),
    }
}

/**
 * The chat's tools. Every tool but `findTools` (the AI SDK's tool search) is deferred, so the model loads only what it
 * looks for, except the ones this conversation already used or found (`used`): discovery lasts one generation, and
 * an edit's Accept/Reject starts the next.
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
            description: 'Read a note\'s Markdown by its workspace-relative path (as searchNotes or listNotes return it) or its name.',
            inputSchema: pathInput('Workspace-relative path, e.g. "Folder/Note.md", or a note\'s name, e.g. "Note".'),
            execute: async ({path}) => {
                let found = path
                let text = await deps.read(path)
                // Models pass partial names ("2-3" for "Note 2-3"): one note containing it is the one meant.
                const near = text === null ? deps.list('').filter(p => p.toLowerCase().includes(path.toLowerCase().replace(/\.(md|txt)$/, ''))) : []
                if (near.length === 1) text = await deps.read(found = near[0]!)
                if (text === null) {
                    return {error: near.length
                        ? `There's no note at "${path}". Did you mean one of: ${near.slice(0, 5).join(', ')}?`
                        : `There's no note at "${path}". Use searchNotes or listNotes for its path.`}
                }
                return text.length > NOTE_READ_CHARS ? {path: found, markdown: text.slice(0, NOTE_READ_CHARS), truncated: true} : {path: found, markdown: text}
            },
        }),
        listNotes: tool({
            description: 'List the notes in a folder and its subfolders, as workspace-relative paths.',
            inputSchema: jsonSchema<{ folder?: string }>({
                type: 'object', properties: {folder: {type: 'string', description: 'Workspace-relative folder; omit for the whole workspace.'}}, additionalProperties: false,
            }),
            execute: ({folder}) => {
                const paths = deps.list((folder ?? '').replace(/^\/+|\/+$/g, ''))
                return {paths: paths.slice(0, LIST_LIMIT), more: Math.max(0, paths.length - LIST_LIMIT)}
            },
        }),
        ...(deps.mode === 'suggest' ? suggestTools : deps.mode === 'write' ? writeTools(deps) : {}),
    }
    const deferred = Object.entries(tools).map(([name, t]) => [name, used.has(name) ? t : {...t, deferLoading: true}])
    return {[FIND_TOOLS]: toolSearch({search: rankTools, maxResults: Object.keys(tools).length}), ...Object.fromEntries(deferred)}
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
