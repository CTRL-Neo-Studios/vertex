import {describe, expect, it} from "vitest";
import type {Tool} from "ai";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {chatTools, rankTools, toolsUnsupported, usedToolNames, type NoteToolDeps} from "./chatTools";

const deps = (over: Partial<NoteToolDeps> = {}): NoteToolDeps => ({
    search: async () => [],
    read: async () => null,
    list: () => [],
    editing: false,
    ...over,
})
const run = (t: Tool | undefined, input: unknown) => t!.execute!(input as never, {toolCallId: 't', messages: []} as never)
const deferred = (tools: Record<string, Tool>) => Object.entries(tools).filter(([, t]) => t.deferLoading).map(([n]) => n).sort()

describe('chatTools', () => {
    it('defers every tool but findTools and the ones already used; editor tools only with an open note', () => {
        const plain = chatTools(deps(), new Set())
        expect(Object.keys(plain)).toEqual(['findTools', 'searchNotes', 'readNote', 'listNotes'])
        expect(deferred(plain)).toEqual(['listNotes', 'readNote', 'searchNotes'])
        const editing = chatTools(deps({editing: true}), new Set(['proposeEdit', 'readNote']))
        expect(deferred(editing)).toEqual(['listNotes', 'proposeInsert', 'readDocument', 'readSelection', 'searchNotes'])
        expect(editing.proposeEdit!.deferLoading).toBeFalsy()
    })

    it('readNote caps long notes and tells the model when a path is wrong', async () => {
        const tools = chatTools(deps({read: async path => path === 'Long.md' ? 'x'.repeat(25_000) : null}), new Set())
        const long = await run(tools.readNote, {path: 'Long.md'}) as { markdown: string, truncated?: boolean }
        expect([long.markdown.length, long.truncated]).toEqual([20_000, true])
        expect(await run(tools.readNote, {path: 'Nope.md'})).toEqual({error: expect.stringContaining('"Nope.md"')})
    })

    it('readNote reads the one note whose path contains a partial name, and names the candidates when several do', async () => {
        const notes: Record<string, string> = {'Folder 2/Note 2-3.md': 'banana23', 'A/Note 1.md': 'one', 'B/Note 1.md': 'uno'}
        const tools = chatTools(deps({read: async path => notes[path] ?? null, list: () => Object.keys(notes)}), new Set())
        expect(await run(tools.readNote, {path: '2-3'})).toEqual({path: 'Folder 2/Note 2-3.md', markdown: 'banana23'})
        expect(await run(tools.readNote, {path: 'note 1'})).toEqual({error: expect.stringContaining('A/Note 1.md, B/Note 1.md')})
    })

    it('listNotes trims slashes off the folder and reports what it left out', async () => {
        let asked = ''
        const paths = Array.from({length: 205}, (_, i) => `A/${i}.md`)
        const tools = chatTools(deps({list: folder => { asked = folder; return paths }}), new Set())
        const out = await run(tools.listNotes, {folder: '/A/'}) as { paths: string[], more: number }
        expect([asked, out.paths.length, out.more]).toEqual(['A', 200, 5])
    })
})

describe('usedToolNames', () => {
    it('collects called tools and the ones a search found', () => {
        const messages = [{
            id: 'a', role: 'assistant', parts: [
                {type: 'tool-findTools', toolCallId: '1', state: 'output-available', input: {query: 'edit'}, output: {tools: [{name: 'proposeEdit'}, {name: 'readDocument'}]}},
                {type: 'tool-readNote', toolCallId: '2', state: 'output-available', input: {path: 'a.md'}, output: {markdown: ''}},
                {type: 'tool-findTools', toolCallId: '3', state: 'input-available', input: {query: 'list'}},
                {type: 'text', text: 'done'},
            ],
        }] as VertexChatMessage[]
        expect([...usedToolNames(messages)].sort()).toEqual(['proposeEdit', 'readDocument', 'readNote'])
    })
})

describe('rankTools', () => {
    const tools = [{name: 'searchNotes', description: 'Search the notes.'}, {name: 'proposeEdit', description: 'Propose replacing a passage.'}]
    it('puts tools sharing the query\'s words first, and lists them all when none do', () => {
        expect(rankTools({query: 'edit the open note', tools})).toEqual(['proposeEdit', 'searchNotes'])
        expect(rankTools({query: 'Gilded Kraken', tools})).toEqual(['searchNotes', 'proposeEdit'])
    })
})

describe('toolsUnsupported', () => {
    it('recognizes providers\' "no tools" errors and nothing else', () => {
        expect(toolsUnsupported('registry.ollama.ai/library/gemma3:4b does not support tools')).toBe(true)
        expect(toolsUnsupported('No endpoints found that support tool use.')).toBe(true)
        expect(toolsUnsupported('"auto" tool choice requires --enable-auto-tool-choice')).toBe(true)
        expect(toolsUnsupported('model "llama9" not found, try pulling it first')).toBe(false)
    })
})
