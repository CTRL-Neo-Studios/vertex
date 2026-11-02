import {mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {buildDocument, run} from '@type32/workflows/core/testing'
import {frontmatterRange, parseFrontmatter, parseYaml, stringifyYaml} from '../../node_modules/@type32/codemirror-rich-obsidian-editor/dist/runtime/utils/frontmatter.js'
import {getInternalLinks} from '../utils/index/rewriteLinks'
import {LinkGraph} from '../utils/index/linkGraph'
import {overlayVault} from './dryRun'
import {createVertexEffects, undoOps, type Op} from './effects'
import {hasTag, matchesPattern, retag, setFrontmatterProperty, vaultPath, type Vault, type VaultEntry, type YamlTools} from './vault'
import {vertexLanguage, type VertexEffects} from './vertex'

const yaml = {frontmatterRange, parseYaml, stringifyYaml} as YamlTools

/** A real folder on disk as a Vault: hidden entries skipped, links resolved like the app's index. */
function diskVault(root: string): Vault {
    let entries: (VaultEntry & {text?: string})[] = []
    const scan = async (dir = '') => {
        for (const name of await readdir(join(root, dir))) {
            if (name.startsWith('.')) continue
            const path = dir ? `${dir}/${name}` : name
            const s = await stat(join(root, path))
            const times = {created: s.birthtimeMs, modified: s.mtimeMs}
            if (s.isDirectory()) {
                entries.push({path, isFolder: true, properties: {}, size: 0, ...times})
                await scan(path)
            } else {
                const text = await readFile(join(root, path), 'utf8')
                const properties = path.endsWith('.md') ? (parseFrontmatter(text).data ?? {}) as Record<string, unknown> : {}
                entries.push({path, isFolder: false, properties, text, size: s.size, ...times})
            }
        }
    }
    const graph = () => {
        const g = new LinkGraph()
        for (const e of entries) if (!e.isFolder) g.addFile({id: e.path, relativePath: e.path})
        for (const e of entries) if (e.text) g.setLinks(e.path, getInternalLinks(e.text).map(l => l.path))
        return g
    }
    const refuse = (path: string) => {
        if (existsSync(join(root, path))) throw new Error(`"${path}" already exists`)
    }
    const vault: Vault & {refresh(): Promise<void>} = {
        async refresh() {
            entries = []
            await scan()
        },
        entry: path => entries.find(e => e.path === path),
        entries: () => entries,
        linksTo(path) {
            const g = graph()
            return g.referencingFiles(path).map(file => ({file, targets: g.targetsPointingAt(file, path)}))
        },
        linksFrom: path => graph().forelinks(path),
        read: path => readFile(join(root, path), 'utf8'),
        async write(path, text) {
            await writeFile(join(root, path), text)
            await vault.refresh()
        },
        async create(path, text) {
            refuse(path)
            await mkdir(dirname(join(root, path)), {recursive: true})
            await writeFile(join(root, path), text)
            await vault.refresh()
        },
        async createFolder(path) {
            refuse(path)
            await mkdir(join(root, path), {recursive: true})
            await vault.refresh()
        },
        async move(from, to) {
            if (from.toLowerCase() !== to.toLowerCase()) refuse(to)
            await mkdir(dirname(join(root, to)), {recursive: true})
            await rename(join(root, from), join(root, to))
            await vault.refresh()
        },
    }
    return vault
}

/** A `ui` that answers from `answers` (by method) and records what was asked. */
function stubUi(answers: Partial<VertexEffects['ui']> = {}): VertexEffects['ui'] & {asked: string[]} {
    const asked: string[] = []
    const fail = (name: string) => async () => {
        throw new Error(`unexpected ui.${name}`)
    }
    const names = ['askText', 'askNumber', 'askChoice', 'askYesNo', 'form', 'pick', 'message', 'currentNote', 'open', 'confirmTrash'] as const
    return Object.assign(Object.fromEntries(names.map(name => [name, async (...args: unknown[]) => {
        asked.push(name)
        return ((answers[name] ?? fail(name)) as (...a: unknown[]) => unknown)(...args)
    }])) as unknown as VertexEffects['ui'], {asked})
}

async function snapshot(root: string, dir = ''): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const name of await readdir(join(root, dir))) {
        const path = dir ? `${dir}/${name}` : name
        if ((await stat(join(root, path))).isDirectory()) Object.assign(out, await snapshot(root, path))
        else out[path] = await readFile(join(root, path), 'utf8')
    }
    return out
}

/** §10: rename every note tagged `draft` to `<name>_archive`, then set `status: archived`. */
const archiveDrafts = () => buildDocument(vertexLanguage, {
    nodes: {
        n1: 'vertex.onManual',
        n2: {type: 'vertex.queryByTag', literals: {tag: 'draft'}},
        n3: 'std.forEach',
        n4: 'vertex.fileName',
        n5: 'vertex.rename',
        n6: {type: 'std.concat', variadic: 2, literals: {arg1: '_archive'}},
        n7: {type: 'vertex.setProperty', literals: {key: 'status', value: 'archived'}, typeArgs: {T: {kind: 'con', id: 'string'}}},
    },
    edges: [
        'n1.then > n3.exec', 'n2.files > n3.list', 'n3.body > n5.exec', 'n3.item > n4.file', 'n4.name > n6.arg0',
        'n6.out > n5.newName', 'n3.item > n5.file', 'n5.then > n7.exec', 'n5.file > n7.file',
    ],
})

let root: string
let vault: Vault & {refresh?: () => Promise<void>}
const files = {
    'Notes/a.md': '---\ntags: [draft]\n---\n# A\n',
    'Notes/b.md': '---\ntags: "#Draft/idea"\ntitle: Bee\n---\nSee [[a]].\n',
    'c.md': '---\ntags: [published]\n---\n',
    'index.md': 'Links: [[a]], [[Notes/b|Bee]], `[[a]]` in code.\n',
    'Archive/.keep': '',
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vertex-vault-'))
    for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(root, path)), {recursive: true})
        await writeFile(join(root, path), text)
    }
    vault = diskVault(root)
    await (vault as {refresh(): Promise<void>}).refresh()
})
afterEach(() => rm(root, {recursive: true, force: true}))

const runOn = async (target: Vault, doc = archiveDrafts(), ui = stubUi()) => {
    const {effects, ops} = createVertexEffects(target, {yaml, runId: 'run1', ui})
    const {result} = await run(vertexLanguage, doc, {event: 'vertex.onManual', effects})
    return {result, ops}
}

describe('§10 against a vault on disk', () => {
    it('renames, sets the property and rewrites links, outside code spans', async () => {
        const {result, ops} = await runOn(vault)
        expect(result).toEqual({status: 'ok', steps: 11})
        const after = await snapshot(root)
        expect(Object.keys(after).sort()).toEqual(['Archive/.keep', 'Notes/a_archive.md', 'Notes/b_archive.md', 'c.md', 'index.md'])
        expect(after['Notes/a_archive.md']).toBe('---\ntags:\n  - draft\nstatus: archived\n---\n# A\n')
        expect(after['Notes/b_archive.md']).toBe('---\ntags: \'#Draft/idea\'\ntitle: Bee\nstatus: archived\n---\nSee [[a_archive]].\n')
        expect(after['index.md']).toBe('Links: [[a_archive]], [[Notes/b_archive|Bee]], `[[a]]` in code.\n')
        expect(after['c.md']).toBe(files['c.md'])
        expect(ops.map(o => o.kind === 'move' ? `${o.why} ${o.from} → ${o.to}` : `${o.why} ${o.path}`)).toEqual([
            'rename Notes/a.md → Notes/a_archive.md',
            'links Notes/b.md',
            'links index.md',
            'property Notes/a_archive.md',
            'rename Notes/b.md → Notes/b_archive.md',
            'links index.md',
            'property Notes/b_archive.md',
        ])
    })

    it('a dry run plans the same ops and leaves the disk alone', async () => {
        const before = await snapshot(root)
        const planned = (await runOn(overlayVault(vault, yaml))).ops
        expect(await snapshot(root)).toEqual(before)
        const done = (await runOn(vault)).ops
        expect(planned).toEqual(done)
    })

    it('undo restores every file, byte for byte', async () => {
        const before = await snapshot(root)
        const {ops} = await runOn(vault)
        expect(await undoOps(vault, ops)).toEqual({undone: 7, skipped: []})
        expect(await snapshot(root)).toEqual(before)
    })

    it('undo skips a file edited since the run, and what depends on it', async () => {
        const {ops} = await runOn(vault)
        await vault.write('Notes/a_archive.md', 'edited by hand')
        const {undone, skipped} = await undoOps(vault, ops)
        expect(skipped.map(s => s.reason)).toEqual(['it was edited since the run', 'an earlier step on this file was skipped'])
        expect(undone).toBe(5)
        const after = await snapshot(root)
        expect(after['Notes/a_archive.md']).toBe('edited by hand')
        expect(after['Notes/b.md']).toBe(files['Notes/b.md'])
    })
})

describe('trash and move', () => {
    const doc = (node: string, literals: Record<string, string> = {}) => buildDocument(vertexLanguage, {
        nodes: {
            go: 'vertex.onManual',
            q: {type: 'vertex.queryByTag', literals: {tag: 'draft'}},
            each: 'std.forEach',
            act: {type: node, literals},
        },
        edges: ['go.then > each.exec', 'q.files > each.list', 'each.body > act.exec', 'each.item > act.file'],
    })

    it('trash moves into .vertex/trash/<run> after asking, and undo brings it back', async () => {
        const before = await snapshot(root)
        const ui = stubUi({confirmTrash: async () => true})
        const {result, ops} = await runOn(vault, doc('vertex.trash'), ui)
        expect(result.status).toBe('ok')
        expect(ui.asked).toEqual(['confirmTrash', 'confirmTrash'])
        expect(Object.keys(await snapshot(root))).toContain('.vertex/trash/run1/Notes/a.md')
        await undoOps(vault, ops)
        const restored = await snapshot(root)
        delete restored['.vertex/trash/run1/Notes/a.md']
        expect(Object.keys(restored).filter(p => !p.startsWith('.vertex'))).toEqual(Object.keys(before))
    })

    it('declining the trash prompt faults the run before anything moves', async () => {
        const {result, ops} = await runOn(vault, doc('vertex.trash'), stubUi({confirmTrash: async () => false}))
        expect(result.status).toBe('fault')
        expect(result.fault?.message).toMatch(/declined/)
        expect(ops).toEqual([])
    })

    it('move needs an existing folder and keeps names', async () => {
        const {result, ops} = await runOn(vault, doc('vertex.move', {folder: 'Archive'}))
        expect(result.status).toBe('ok')
        expect(ops.filter((o): o is Extract<Op, {kind: 'move'}> => o.kind === 'move').map(o => o.to)).toEqual(['Archive/a.md', 'Archive/b.md'])
        const missing = await runOn(vault, doc('vertex.move', {folder: 'Nope'}))
        expect(missing.result.fault?.message).toMatch(/"Nope" is not a folder/)
    })

    it('a folder path outside the vault faults instead of moving', async () => {
        const {result, ops} = await runOn(vault, doc('vertex.move', {folder: '../outside'}))
        expect(result.fault?.code).toBe('E_NODE_THREW')
        expect(ops).toEqual([])
        expect(existsSync(join(root, '../outside'))).toBe(false)
    })
})

describe('reading the vault', () => {
    const index = () => createVertexEffects(vault, {yaml, runId: 'run1', ui: stubUi()}).effects.index
    const all = {recursive: false, files: true, folders: false, extensions: '', tag: '', pattern: ''}

    it('lists a folder by kind, depth, extension, tag and pattern', async () => {
        expect(await index().list('', all)).toEqual(['c.md', 'index.md'])
        expect(await index().list('', {...all, files: false, folders: true})).toEqual(['Archive', 'Notes'])
        expect(await index().list('', {...all, recursive: true, tag: 'draft'})).toEqual(['Notes/a.md', 'Notes/b.md'])
        expect(await index().list('Notes', {...all, pattern: 'b'})).toEqual(['Notes/b.md'])
        expect(await index().list('', {...all, recursive: true, extensions: '.TXT, png'})).toEqual([])
        await expect(index().list('c.md', all)).rejects.toThrow(/not a folder/)
    })

    it('finds by name or glob', async () => {
        expect(await index().find('A')).toEqual(['Notes/a.md'])
        expect(await index().find('Notes/*.md')).toEqual(['Notes/a.md', 'Notes/b.md'])
        expect(await index().find('**/*.md')).toEqual(['Notes/a.md', 'Notes/b.md', 'c.md', 'index.md'])
        expect(await index().find('?.md')).toEqual(['Notes/a.md', 'Notes/b.md', 'c.md'])
    })

    it('links from and to, and file info', async () => {
        expect(await index().linksFrom('index.md')).toEqual(['Notes/a.md', 'Notes/b.md'])
        expect(await index().linksTo('Notes/a.md')).toEqual(['Notes/b.md', 'index.md'])
        expect(await index().info('c.md')).toMatchObject({name: 'c.md', extension: 'md', folder: '', size: files['c.md'].length})
        await expect(index().read('Notes')).rejects.toThrow(/is a folder/)
    })
})

describe('making and editing files', () => {
    const fs = (target: Vault = vault) => createVertexEffects(target, {yaml, runId: 'run1', ui: stubUi()})

    it('creates a note from a template in a new folder, and undo moves both to the trash', async () => {
        const before = await snapshot(root)
        const {effects, ops} = fs()
        const folder = await effects.fs.createFolder('', 'Inbox')
        expect(await effects.fs.createNote(folder, 'Idea', 'c.md')).toBe('Inbox/Idea.md')
        await expect(effects.fs.createNote(folder, 'Idea.md')).rejects.toThrow(/already exists/)
        expect((await snapshot(root))['Inbox/Idea.md']).toBe(files['c.md'])
        expect(await undoOps(vault, ops)).toEqual({undone: 2, skipped: []})
        const after = await snapshot(root)
        expect(after['.vertex/trash/run1/new-1/Inbox/Idea.md']).toBe(files['c.md'])
        expect(Object.keys(after).filter(p => !p.startsWith('.vertex'))).toEqual(Object.keys(before))
    })

    it('copies a folder with what it holds', async () => {
        const {effects, ops} = fs()
        expect(await effects.fs.copy('Notes', 'Archive')).toBe('Archive/Notes')
        const after = await snapshot(root)
        expect(after['Archive/Notes/b.md']).toBe(files['Notes/b.md'])
        expect(after['Notes/b.md']).toBe(files['Notes/b.md'])
        await expect(effects.fs.copy('Notes', 'Notes')).rejects.toThrow(/into itself/)
        expect(ops.map(o => o.kind)).toEqual(['create'])
    })

    it('appends on a new line, adds and removes tags', async () => {
        const {effects} = fs()
        await effects.fs.append('c.md', 'one')
        await effects.fs.append('c.md', 'two')
        expect((await snapshot(root))['c.md']).toBe(`${files['c.md']}one\ntwo`)
        await effects.fs.tag('Notes/b.md', 'inbox', true)
        await effects.fs.tag('Notes/b.md', '#draft/IDEA', false)
        expect(await effects.index.property('Notes/b.md', 'tags')).toEqual(['inbox'])
        await expect(effects.fs.tag('Archive', 'x', true)).rejects.toThrow(/is a folder/)
    })

    it('a dry run of new files plans the same ops and leaves the disk alone', async () => {
        const before = await snapshot(root)
        const plan = async (target: Vault) => {
            const {effects, ops} = fs(target)
            const note = await effects.fs.createNote(await effects.fs.createFolder(await effects.fs.createFolder('', 'Inbox'), '2026'), 'Day')
            await expect(effects.fs.createNote('Inbox/2027', 'Day')).rejects.toThrow(/not a folder/)
            await effects.fs.append(note, 'hello')
            await effects.fs.tag(note, 'daily', true)
            expect(await effects.index.list('Inbox', {recursive: true, files: true, folders: true, extensions: '', tag: 'daily', pattern: ''}))
                .toEqual(['Inbox/2026/Day.md'])
            return ops
        }
        const planned = await plan(overlayVault(vault, yaml))
        expect(await snapshot(root)).toEqual(before)
        expect(await plan(vault)).toEqual(planned)
    })

    it('a program asks for a name and makes a tagged note', async () => {
        const doc = buildDocument(vertexLanguage, {
            nodes: {
                go: 'vertex.onManual',
                ask: {type: 'vertex.askText', literals: {question: 'Name?'}},
                make: 'vertex.createNote',
                tag: {type: 'vertex.addTag', literals: {tag: 'inbox'}},
            },
            edges: ['go.then > ask.exec', 'ask.then > make.exec', 'ask.answer > make.name', 'make.then > tag.exec', 'make.note > tag.note'],
        })
        const ui = stubUi({askText: async () => 'Idea'})
        const {result} = await runOn(vault, doc, ui)
        expect(result.status).toBe('ok')
        expect(ui.asked).toEqual(['askText'])
        expect((await snapshot(root))['Idea.md']).toBe('---\ntags:\n  - inbox\n---\n\n')
    })
})

describe('helpers', () => {
    it('vaultPath confines program paths', () => {
        for (const bad of ['../x', '/etc/passwd', 'a/../b', 'a//b', './a', 'C:/x', '~/x', 'a\\b', '.vertex/trash/x'])
            expect(() => vaultPath(bad), bad).toThrow()
        expect(vaultPath('Notes/a.md')).toBe('Notes/a.md')
        expect(vaultPath('')).toBe('')
    })

    it('tags match without # and case, nested tags included', () => {
        expect(hasTag({tags: ['Draft']}, '#draft')).toBe(true)
        expect(hasTag({tags: '#draft/idea, other'}, 'draft')).toBe(true)
        expect(hasTag({tags: ['drafts']}, 'draft')).toBe(false)
        expect(hasTag({}, 'draft')).toBe(false)
    })

    it('setFrontmatterProperty adds a block when there is none and refuses an unclosed one', () => {
        expect(setFrontmatterProperty('# T\n', 'status', 'archived', yaml)).toBe('---\nstatus: archived\n---\n\n# T\n')
        expect(setFrontmatterProperty('---\ncount: 1\n---\nx', 'm', new Map([['k', [1, 2]]]), yaml))
            .toBe('---\ncount: 1\nm:\n  k:\n    - 1\n    - 2\n---\nx')
        expect(() => setFrontmatterProperty('---\ncount: 1\nbody', 'm', 1, yaml)).toThrow(/not closed/)
    })

    it('matchesPattern: names with or without extension, globs on names or paths', () => {
        expect(matchesPattern('A/Read Me.md', 'read me')).toBe(true)
        expect(matchesPattern('A/b.md', 'A/b.md')).toBe(true)
        expect(matchesPattern('A/B/c.md', 'A/*.md')).toBe(false)
        expect(matchesPattern('A/B/c.md', 'A/**/*.md')).toBe(true)
        expect(matchesPattern('c.md', 'A/**/*.md')).toBe(false)
        expect(matchesPattern('x/a+b.md', 'a+b.*')).toBe(true)
    })

    it('retag keeps the key and other tags, and reports no change', () => {
        expect(retag({tag: 'a b'}, '#C', true)).toEqual({key: 'tag', tags: ['a', 'b', 'C']})
        expect(retag({tags: ['A']}, 'a', true)).toBeUndefined()
        expect(retag({tags: ['a', 'a/b']}, 'A', false)).toEqual({key: 'tags', tags: ['a/b']})
        expect(() => retag({}, 'two words', true)).toThrow()
    })
})
