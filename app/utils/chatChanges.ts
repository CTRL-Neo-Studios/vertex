import type {ChatChange, VertexChatMessage} from "#shared/types/app/chats";
import {vaultPath} from "#shared/workflows/vault";

/**
 * The path a model gave for a new note, checked: workspace-relative (leading slashes dropped), nothing under a dot
 * folder (the index never shows those), `.md` added unless it's there. Throws a reason the model can act on.
 */
export function newNotePath(path: string): string {
    const relative = vaultPath(path.trim().replace(/^\/+/, ''))
    if (!relative) throw new Error('A new note needs a path, e.g. "Folder/Note.md".')
    if (relative.split('/').some(s => s.startsWith('.'))) throw new Error(`"${relative}" is inside a hidden folder.`)
    return /\.md$/i.test(relative) ? relative : `${relative}.md`
}

/** The one change that turns `from` into `to`: what lies between their common start and end (CodeMirror's shape). */
export function textChange(from: string, to: string) {
    let start = 0
    while (start < from.length && start < to.length && from[start] === to[start]) start++
    let end = 0
    while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++
    return {from: start, to: from.length - end, insert: to.slice(start, to.length - end)}
}

const OUTCOMES: Record<ChatChange['state'], string> = {
    pending: 'not reviewed yet',
    applied: 'applied by the user',
    discarded: 'discarded by the user',
    conflict: 'not applied: the note changed after you staged it',
    undone: 'applied, then undone',
}

/** What became of the conversation's staged changes (the latest per note), for the model; '' when there were none. */
export function changesSummary(messages: VertexChatMessage[]): string {
    const latest = new Map<string, ChatChange>()
    for (const change of messages.flatMap(m => m.metadata?.changes ?? [])) latest.set(change.path, change)
    if (!latest.size) return ''
    const lines = [...latest.values()].map(c => `- "${c.path}"${c.before === null ? ' (new note)' : ''}: ${OUTCOMES[c.state]}`)
    return `Your earlier staged changes and what became of them:\n${lines.join('\n')}`
}
