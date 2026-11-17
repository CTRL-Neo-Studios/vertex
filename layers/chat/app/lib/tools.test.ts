import {describe, expect, it} from "vitest";
import type {Tool} from "ai";
import type {VertexChatMessage} from "../../shared/types";
import type {FileOpResult, NoteSearchOptions} from "#shared/plugin/api";
import {chatTools, formatTree, inScope, markModeSwitches, modeError, rankTools, readLines, toolsPrompt, toolsUnsupported, usedToolNames, type NoteToolDeps} from "./tools";

const deps = (over: Partial<NoteToolDeps> = {}): NoteToolDeps => ({
    search: async () => ({hits: [], more: 0}),
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
        // Without the workflows plugin there's no such tool.
        expect(chatTools(deps({mode: 'write'}), new Set()).runWorkflow).toBeUndefined()
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
        expect(await run(tools.readNote, {path: '2-3'})).toMatchObject({path: 'Folder 2/Note 2-3.md', markdown: 'banana23'})
        expect(await run(tools.readNote, {path: 'note 1'})).toEqual({error: expect.stringContaining('A/Note 1.md, B/Note 1.md')})
    })

    it('readNote without a path reads the note open in the editor, and says so when there is none', async () => {
        const tools = chatTools(deps({read: async path => path === 'Open.md' ? 'a\nb' : null, openNote: () => 'Open.md'}), new Set())
        expect(await run(tools.readNote, {})).toEqual({path: 'Open.md', markdown: 'a\nb', startLine: 1, endLine: 2, totalLines: 2})
        expect(await run(chatTools(deps(), new Set()).readNote, {})).toEqual({error: expect.stringContaining('No note is open')})
    })

    it('fetchUrl asks before fetching, except from the sites allowed in the chat and the URLs the user wrote', () => {
        const asks = chatTools(deps({allowedHost: host => host === 'docs.example.com'}), new Set()).fetchUrl!.needsApproval as (input: unknown, options: unknown) => boolean
        const messages = [
            {role: 'user', content: [{type: 'text', text: 'Summarize https://blog.example/post#intro, please.'}]},
            {role: 'assistant', content: 'Fetching https://evil.example/steal?q=secret'},
        ]
        const ask = (url: string) => asks({url}, {messages})
        expect([ask('https://docs.example.com/a'), ask('https://evil.example/?q=x'), ask('not a url')]).toEqual([false, true, true])
        // Written by the user (fragment and trailing comma aside), not by the model.
        expect([ask('https://blog.example/post'), ask('https://BLOG.example/post#top'), ask('https://evil.example/steal?q=secret')]).toEqual([false, false, true])
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
        expect(await find({glob: 'A/*.{md,png}'})).toEqual(['A/Inn.md', 'A/map.png'])
        expect(await find({glob: '**/inn.md'})).toEqual(['A/Inn.md', 'AB/Inn.md'])
        expect(await find({glob: '*.md', folder: 'AB'})).toEqual(['AB/Inn.md'])
        const many = chatTools(deps({files: () => Array.from({length: 205}, (_, i) => ({path: `${i}.md`, kind: 'md'}))}), new Set())
        expect(await run(many.findFiles, {})).toEqual({files: expect.any(Array), more: 5})
    })

    it('findFiles names "glob" in its description, so findTools finds it', () => {
        const tools = chatTools(deps(), new Set())
        const all = Object.entries(tools).map(([name, t]) => ({name, description: t.description as string | undefined}))
        expect(rankTools({query: 'glob', tools: all})[0]).toBe('findFiles')
        expect(rankTools({query: 'grep regular expression', tools: all})[0]).toBe('searchNotes')
    })

    it('searchNotes passes its options, shows each hit\'s line, and says how many more there were', async () => {
        const asked: [string, NoteSearchOptions][] = []
        const search = async (query: string, options: NoteSearchOptions) => {
            asked.push([query, options])
            if (query === '(') throw new Error('regex parse error: unclosed group')
            return {hits: [{path: 'A/Plan.md'}, {path: 'A/Plan.md', line: 3, snippet: '- [ ] TODO a'}, {path: 'B.md', line: 9, snippet: 'TODO b\nnext line'}], more: 4}
        }
        const tools = chatTools(deps({search}), new Set())
        expect(await run(tools.searchNotes, {query: 'TODO', regex: true, folder: '/A/', caseSensitive: true, context: 1, limit: 3})).toEqual({
            hits: 'A/Plan.md (the path matches)\nA/Plan.md:3: - [ ] TODO a\nB.md:9: TODO b\n    next line',
            more: expect.stringMatching(/^4 more hits not shown: pass a higher limit.*folder/),
        })
        expect(asked[0]).toEqual(['TODO', {regex: true, folder: 'A', caseSensitive: true, context: 1, limit: 3}])
        expect(await run(tools.searchNotes, {query: '(', regex: true})).toEqual({error: 'regex parse error: unclosed group'})
        expect(await run(chatTools(deps(), new Set()).searchNotes, {query: 'x'})).toEqual({hits: 'No matches.'})
    })

    it('moveFiles resolves `from` (a path, else a note\'s name), moves in one call and reports what it skipped and why', async () => {
        const files = [{path: 'Inbox', kind: 'folder'}, {path: 'Inbox/Idea.md', kind: 'md'}, {path: 'Inbox/b.png', kind: 'png'}, {path: 'Todo.md', kind: 'md'}]
        const calls: [string, { from: string, to: string }[]][] = []
        const transfer = async (kind: 'move' | 'copy', items: { from: string, to: string }[]): Promise<FileOpResult> => {
            calls.push([kind, items])
            return {done: [{uuid: 'u1', to: 'Archive/Idea.md'}], skipped: [{to: 'Done.md', reason: 'exists'}, {to: 'Archive/Inbox/b.png', reason: 'inside'}]}
        }
        const findNote = (name: string) => name.toLowerCase() === 'todo' ? 'Todo.md' : undefined
        const tools = chatTools(deps({mode: 'write', files: () => files, findNote, transfer}), new Set())
        const result = await run(tools.moveFiles, {moves: [
            {from: '/Inbox/Idea.md', to: 'Archive/Idea.md/'}, {from: 'todo', to: 'Done.md'},
            {from: 'Inbox/b.png', to: 'Archive/Inbox/b.png'}, {from: 'Ghost', to: 'X.md'},
        ]})
        expect(calls).toEqual([['move', [
            {from: 'Inbox/Idea.md', to: 'Archive/Idea.md'}, {from: 'Todo.md', to: 'Done.md'}, {from: 'Inbox/b.png', to: 'Archive/Inbox/b.png'},
        ]]])
        expect(result).toEqual({
            moved: ['Inbox/Idea.md → Archive/Idea.md'],
            skipped: [
                expect.stringMatching(/^Todo\.md → Done\.md: not moved, the target path is taken; choose another name/),
                expect.stringMatching(/^Inbox\/b\.png → Archive\/Inbox\/b\.png: not moved, .*goes with its folder/),
            ],
            notFound: [expect.stringContaining('"Ghost": no such file, folder or note')],
        })
        expect(await run(tools.moveFiles, {moves: [{from: 'Ghost', to: 'X.md'}]})).toEqual({error: expect.stringMatching(/^Nothing moved\. "Ghost"/)})
        await run(tools.copyFiles, {copies: [{from: 'Todo.md', to: 'Todo 2.md'}]})
        expect(calls.at(-1)).toEqual(['copy', [{from: 'Todo.md', to: 'Todo 2.md'}]])
    })

    it('moveFiles and copyFiles ask once in Write mode and refuse in the others, without asking', async () => {
        let transfers = 0
        const transfer = async (): Promise<FileOpResult> => { transfers++; return {done: [], skipped: []} }
        const files = () => [{path: 'A.md', kind: 'md'}]
        for (const mode of ['read', 'suggest'] as const) {
            const tools = chatTools(deps({mode, files, transfer}), new Set())
            for (const name of ['moveFiles', 'copyFiles']) {
                expect((tools[name]!.needsApproval as () => boolean)()).toBe(false)
                expect(await run(tools[name], {[name === 'moveFiles' ? 'moves' : 'copies']: [{from: 'A.md', to: 'B.md'}]})).toEqual({error: expect.stringContaining('only works in Write mode')})
            }
        }
        expect(transfers).toBe(0)
        const write = chatTools(deps({mode: 'write', files, transfer}), new Set())
        expect((write.moveFiles!.needsApproval as () => boolean)()).toBe(true)
        expect((write.copyFiles!.needsApproval as () => boolean)()).toBe(true)
        expect(toolsPrompt('write', 'any note', true)).toMatch(/use `moveFiles`.*never recreate a file.*`copyFiles`.*`folderTree`.*`toolFeedback`/)
    })

    it('toolFeedback records the report and says it stayed on this computer', async () => {
        const kept: unknown[] = []
        const tools = chatTools(deps({feedback: async input => { kept.push(input) }}), new Set())
        const input = {kind: 'missing', summary: 'No tool empties the trash', details: 'Asked to empty the trash.'}
        expect(await run(tools.toolFeedback, input)).toEqual({recorded: expect.stringContaining('Settings → Chat')})
        expect(kept).toEqual([input])
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

describe('formatTree', () => {
    const entries = [
        {path: 'Projects', kind: 'folder'}, {path: 'Projects/Alpha', kind: 'folder'}, {path: 'Projects/Alpha/Deep', kind: 'folder'},
        {path: 'Projects/Alpha/Deep/x.md', kind: 'md'}, {path: 'Projects/Alpha/a.md', kind: 'md'},
        ...Array.from({length: 4}, (_, i) => ({path: `Projects/n${i + 1}.md`, kind: 'md'})),
        {path: 'Inbox', kind: 'folder'}, {path: 'Home.md', kind: 'md'}, {path: '.obsidian', kind: 'folder'}, {path: '.obsidian/app.json', kind: 'json'},
    ]

    it('indents folders before files, with file counts, a cap per folder and the folders past `depth` unopened', () => {
        expect(formatTree(entries, '', 2, 3)).toBe([
            '(workspace) (7 files)',
            '  Inbox/ (0 files)',
            '  Projects/ (6 files)',
            '    Alpha/ (2 files, not opened)',
            '    n1.md',
            '    n2.md',
            '    n3.md',
            '    … 1 more',
            '  Home.md',
        ].join('\n'))
    })

    it('starts at a folder, and is undefined for one that isn\'t there', () => {
        expect(formatTree(entries, '/Projects/Alpha/')).toBe('Projects/Alpha/ (2 files)\n  Deep/ (1 file)\n    x.md\n  a.md')
        expect(formatTree(entries, 'Nope')).toBeUndefined()
    })
})

describe('readLines', () => {
    const text = ['one', 'two', 'three', 'four'].join('\n')

    it('reads a range of lines, clamped to the note, with its line count', () => {
        expect(readLines(text, 2, 3)).toEqual({markdown: 'two\nthree', startLine: 2, endLine: 3, totalLines: 4})
        expect(readLines(text, 3, 99)).toEqual({markdown: 'three\nfour', startLine: 3, endLine: 4, totalLines: 4})
        expect(readLines(text, 5)).toEqual({error: expect.stringContaining('4 lines')})
    })

    it('stops at the last whole line under the cap and marks the read truncated', () => {
        expect(readLines(text, 1, undefined, 9)).toEqual({markdown: 'one\ntwo', startLine: 1, endLine: 2, totalLines: 4, truncated: true})
        expect(readLines(text, 3, undefined, 9)).toEqual({markdown: 'three', startLine: 3, endLine: 3, totalLines: 4, truncated: true})
        expect(readLines('x'.repeat(30), 1, undefined, 10)).toMatchObject({markdown: 'x'.repeat(10), endLine: 1, truncated: true})
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
    it('puts bash after every other match, even one made for another mode', () => {
        const all = [{name: 'bash', description: 'Run a command to search notes and edit many files.'}, {name: 'searchNotes', description: 'Search the notes.'}, {name: 'proposeEdit', description: 'Suggest mode: edit a note.'}]
        expect(rankTools({query: 'search notes and edit', tools: all}, 'write')).toEqual(['searchNotes', 'proposeEdit', 'bash'])
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
