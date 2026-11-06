import {getToolName, isToolUIPart, jsonSchema, tool, toolSearch, type ToolSet} from "ai";
import {editorTools} from "@type32/codemirror-rich-obsidian-editor/ext/ai/tools";
import type {VertexChatMessage} from "#shared/types/app/chats";

/** What the note tools reach in the workspace; `useChats` binds them to a session. */
export interface NoteToolDeps {
    /** Notes whose path or text matches (Rust `notes_search`). */
    search: (query: string) => Promise<{ path: string, snippet: string | null }[]>
    /** A note's text by workspace-relative path (the open editor's buffer when it's mounted); `null` when there's none. */
    read: (path: string) => Promise<string | null>
    /** Workspace-relative paths of the notes under `folder` (`''` = all). */
    list: (folder: string) => string[]
    /** Whether a note is open in an editor: the editor tools (read it, propose edits) only come with one. */
    editing: boolean
}

const NOTE_READ_CHARS = 20_000
const LIST_LIMIT = 200
/** Named for what it does: a model told to "search" passes it the user's topic instead of a tool's. */
const FIND_TOOLS = 'findTools'

/** Added to the system prompt when tools are sent. */
export const TOOLS_PROMPT = 'You can use tools on the user\'s notes. Your tools load on demand: call `findTools` with what you '
    + 'want to do (for example "search notes", "read note", "list notes", "read the open document" or "edit the open '
    + 'document"), then call the tools it returns. Edits are only proposed: the user accepts or rejects each one, and the '
    + 'result tells you which.'

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
        ...(deps.editing ? editorTools : {}),
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
