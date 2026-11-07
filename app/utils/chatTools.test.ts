import {describe, expect, it} from "vitest";
import type {Tool} from "ai";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {chatTools, inScope, markModeSwitches, modeError, rankTools, toolsUnsupported, usedToolNames, type NoteToolDeps} from "./chatTools";

const deps = (over: Partial<NoteToolDeps> = {}): NoteToolDeps => ({
    search: async () => [],
    read: async () => null,
    list: () => [],
    files: () => [],
    mode: 'read',
    ...over,
})
const run = (t: Tool | undefined, input: unknown) => t!.execute!(input as never, {toolCallId: 't', messages: []} as never)

describe('chatTools', () => {
    it('sends the same tools in every mode, deferred but for findTools, askUser and the ones already used', () => {
        const names = (mode: NoteToolDeps['mode']) => Object.keys(chatTools(deps({mode}), new Set())).sort()
        expect(names('read')).toEqual(names('write'))
        expect(names('suggest')).toEqual(names('write'))
        const tools = chatTools(deps({mode: 'suggest'}), new Set(['proposeEdit', 'readNote']))
        expect(Object.keys(tools).filter(n => !tools[n]!.deferLoading).sort()).toEqual(['askUser', 'findTools', 'proposeEdit', 'readNote'])
    })

    it('a tool made for another mode refuses, naming its mode and what to use instead', async () => {
        const staged: string[] = []
        const stage = async (path: string) => { staged.push(path); return {status: 'staged'} }
        const suggest = chatTools(deps({mode: 'suggest', read: async () => 'text', stage}), new Set())
        expect(await run(suggest.editNote, {path: 'A.md', find: 'text', replace: 'x'})).toEqual({error: expect.stringMatching(/Write mode.*Suggest mode.*Use proposeEdit/)})
        const read = chatTools(deps({mode: 'read', stage}), new Set())
        expect(await run(read.createNote, {path: 'B.md', markdown: 'b'})).toEqual({error: expect.stringContaining('switch the chat to Suggest or Write')})
        expect(staged).toEqual([])
        // The editor tools have no execute: useChats asks modeError itself.
        expect(modeError('proposeEdit', 'write')).toEqual({error: expect.stringMatching(/Suggest mode.*Write mode.*Use editNote/)})
        expect(modeError('createNote', 'suggest')).toEqual({error: expect.stringContaining('switch the chat to Write mode')})
        expect(modeError('proposeEdit', 'suggest')).toBeUndefined()
        expect(modeError('readNote', 'read')).toBeUndefined()
    })

    it('runWorkflow: dry runs in any mode; a real run asks first and only in Write mode', async () => {
        const runs: [string, boolean][] = []
        const runWorkflow = async (path: string, _note: string | undefined, dry: boolean) => { runs.push([path, dry]); return {status: 'ok'} }
        const suggest = chatTools(deps({mode: 'suggest', runWorkflow}), new Set())
        expect(await run(suggest.runWorkflow, {path: 'W', dryRun: true})).toEqual({status: 'ok'})
        expect(await run(suggest.runWorkflow, {path: 'W'})).toEqual({error: expect.stringContaining('only works in Write mode')})
        const write = chatTools(deps({mode: 'write', runWorkflow}), new Set())
        const asks = write.runWorkflow!.needsApproval as (input: unknown) => boolean
        expect([asks({path: 'W'}), asks({path: 'W', dryRun: true})]).toEqual([true, false])
        expect(await run(write.runWorkflow, {path: 'W'})).toEqual({status: 'ok'})
        expect(runs).toEqual([['W', true], ['W', false]])
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

    it('findFiles filters by folder, name and kind, and reports what it left out', async () => {
        const files = [
            {path: 'A/Inn.md', kind: 'md'}, {path: 'A/map.png', kind: 'png'}, {path: 'A/Sub', kind: 'folder'},
            {path: 'AB/Inn.md', kind: 'md'}, {path: 'Run.workflow', kind: 'workflow'},
        ]
        const tools = chatTools(deps({files: () => files}), new Set())
        const find = async (input: object) => ((await run(tools.findFiles, input)) as { files: { path: string }[] }).files.map(f => f.path)
        expect(await find({folder: '/A/'})).toEqual(['A/Inn.md', 'A/map.png', 'A/Sub'])
        expect(await find({query: 'inn'})).toEqual(['A/Inn.md', 'AB/Inn.md'])
        expect(await find({extension: '.workflow'})).toEqual(['Run.workflow'])
        const many = chatTools(deps({files: () => Array.from({length: 205}, (_, i) => ({path: `${i}.md`, kind: 'md'}))}), new Set())
        expect(await run(many.findFiles, {})).toEqual({files: expect.any(Array), more: 5})
    })

    it('Write mode: editNote stages the note with its one matching passage replaced, and refuses missing or repeated ones', async () => {
        const staged: [string, string, boolean][] = []
        const tools = chatTools(deps({
            mode: 'write',
            read: async path => path === 'A.md' ? 'one two one three' : null,
            stage: async (path, markdown, create) => { staged.push([path, markdown, create]); return {status: 'staged'} },
        }), new Set())
        expect(Object.keys(tools)).toEqual(expect.arrayContaining(['createNote', 'writeNote', 'editNote']))
        expect(await run(tools.editNote, {path: 'A.md', find: 'two', replace: '2'})).toEqual({status: 'staged'})
        expect(staged).toEqual([['A.md', 'one 2 one three', false]])
        expect(await run(tools.editNote, {path: 'A.md', find: 'one', replace: '1'})).toEqual({error: expect.stringContaining('more than once')})
        expect(await run(tools.editNote, {path: 'A.md', find: 'four', replace: '4'})).toEqual({error: expect.stringContaining('not found')})
        expect(await run(tools.editNote, {path: 'B.md', find: 'x', replace: 'y'})).toEqual({error: expect.stringContaining('"B.md"')})
        expect(staged).toHaveLength(1)
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
        expect(rankTools({query: 'edit the open document', tools})).toEqual(['proposeEdit', 'searchNotes'])
        expect(rankTools({query: 'Gilded Kraken', tools})).toEqual(['searchNotes', 'proposeEdit'])
    })
    it('matches plurals with singulars', () => {
        const listing = [{name: 'findFiles', description: 'Find files of any type (notes, workflows).'}, {name: 'searchNotes', description: 'Search the text.'}]
        expect(rankTools({query: 'workflow', tools: listing})).toEqual(['findFiles'])
    })
    it('puts tools made for another mode after this mode\'s', () => {
        const both = [{name: 'proposeEdit', description: 'Suggest mode: edit a note.'}, {name: 'editNote', description: 'Write mode: replace a passage.'}]
        expect(rankTools({query: 'edit a note', tools: both}, 'write')).toEqual(['editNote', 'proposeEdit'])
        expect(rankTools({query: 'edit a note', tools: both}, 'suggest')).toEqual(['proposeEdit', 'editNote'])
    })
})

describe('markModeSwitches', () => {
    const user = (id: string, mode?: 'read' | 'write'): VertexChatMessage => ({id, role: 'user', parts: [{type: 'text', text: id}], metadata: {mode}})
    it('tells the model at the first message after the mode changed, and nowhere else', () => {
        const marked = markModeSwitches([user('a'), user('b', 'read'), user('c', 'read'), {id: 'r', role: 'assistant', parts: []}, user('d', 'write')])
        expect(marked.map(m => m.parts.map(p => p.type === 'text' ? p.text : '').join(' | '))).toEqual(['a', 'b', 'c', '', '(The user switched this chat to Write mode.) | d'])
    })
})

describe('inScope', () => {
    const named = {notes: ['Open.md', 'Lore/Kthalatir.md'], folders: ['Lore/Places']}
    it('named: the named notes and everything under a named folder, nothing else', () => {
        expect(inScope('Lore/Kthalatir.md', undefined, named)).toBe(true)
        expect(inScope('Lore/Places/Deep/Inn.md', {kind: 'named'}, named)).toBe(true)
        expect(inScope('Lore/Other.md', undefined, named)).toBe(false)
        // A folder is a path prefix only at a slash: "Lore/Places Old" isn't inside "Lore/Places".
        expect(inScope('Lore/Places Old/Inn.md', undefined, named)).toBe(false)
    })
    it('folder: its notes at any depth; workspace: any note', () => {
        expect(inScope('Lore/Places/Inn.md', {kind: 'folder', path: 'Lore'}, named)).toBe(true)
        expect(inScope('Lorem/Inn.md', {kind: 'folder', path: 'Lore'}, named)).toBe(false)
        expect(inScope('Open.md', {kind: 'folder', path: 'Lore'}, named)).toBe(false)
        expect(inScope('Anything.md', {kind: 'workspace'}, {notes: [], folders: []})).toBe(true)
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
