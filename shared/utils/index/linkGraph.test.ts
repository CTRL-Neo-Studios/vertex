import {describe, expect, it} from 'vitest'
import {LinkGraph, linkKeys} from './linkGraph'

function graph(files: Record<string, string>, links: Record<string, string[]> = {}) {
    const g = new LinkGraph()
    for (const [id, relativePath] of Object.entries(files)) g.addFile({id, relativePath})
    for (const [id, targets] of Object.entries(links)) g.setLinks(id, targets)
    return g
}

describe('linkKeys', () => {
    it('registers basename, path without extension and full path', () => {
        expect(linkKeys('notes/B.md')).toEqual(['B', 'notes/B', 'notes/B.md'])
    })
    it('does not strip a leading dot as an extension', () => {
        expect(linkKeys('.hidden')).toEqual(['.hidden'])
    })
})

describe('LinkGraph', () => {
    it('resolves by basename, relative path, and full path', () => {
        const g = graph({a: 'A.md', b: 'notes/B.md'}, {a: ['B', 'notes/B', 'notes/B.md']})
        expect(g.forelinks('a')).toEqual(['b'])
        expect(g.backlinks('b')).toEqual(['a'])
    })

    it('first registered file wins a shared basename', () => {
        const g = graph({x: 'one/N.md', y: 'two/N.md', a: 'A.md'}, {a: ['N']})
        expect(g.forelinks('a')).toEqual(['x'])
    })

    it('ignores self links and unresolved targets', () => {
        const g = graph({a: 'A.md'}, {a: ['A', 'Missing']})
        expect(g.forelinks('a')).toEqual([])
    })

    it('updating one file only changes its own edges', () => {
        const g = graph({a: 'A.md', b: 'B.md', c: 'C.md'}, {a: ['B'], c: ['B']})
        g.setLinks('a', ['C'])
        expect(g.backlinks('b')).toEqual(['c'])
        expect(g.backlinks('c')).toEqual(['a'])
    })

    it('links to a file created later resolve when it appears', () => {
        const g = graph({a: 'A.md'}, {a: ['Later']})
        expect(g.forelinks('a')).toEqual([])
        g.addFile({id: 'l', relativePath: 'Later.md'})
        expect(g.forelinks('a')).toEqual(['l'])
        expect(g.backlinks('l')).toEqual(['a'])
    })

    it('rename keeps the target id; old-name links become unresolved but are not forgotten', () => {
        const g = graph({a: 'A.md', b: 'B.md'}, {a: ['B']})
        g.moveFile('b', 'Renamed.md')
        expect(g.forelinks('a')).toEqual([])
        // Rename back (or another file named B appears) — the original link resolves again.
        g.moveFile('b', 'B.md')
        expect(g.forelinks('a')).toEqual(['b'])
    })

    it('a moved file keeps its own outgoing links', () => {
        const g = graph({a: 'A.md', b: 'B.md'}, {a: ['B']})
        g.moveFile('a', 'sub/A.md')
        expect(g.forelinks('a')).toEqual(['b'])
        expect(g.backlinks('b')).toEqual(['a'])
    })

    it('removing the owner of a shared name hands links to the next file with that name', () => {
        const g = graph({x: 'one/N.md', y: 'two/N.md', a: 'A.md'}, {a: ['N']})
        g.removeFile('x')
        expect(g.forelinks('a')).toEqual(['y'])
        expect(g.backlinks('y')).toEqual(['a'])
    })

    it('removing a file clears its outgoing and incoming edges', () => {
        const g = graph({a: 'A.md', b: 'B.md'}, {a: ['B'], b: ['A']})
        g.removeFile('a')
        expect(g.backlinks('b')).toEqual([])
        expect(g.forelinks('b')).toEqual([])
    })

    it('referencingFiles reports files a rename would affect', () => {
        const g = graph({a: 'A.md', b: 'notes/B.md', c: 'C.md'}, {a: ['B'], c: ['notes/B'], b: ['A']})
        expect(g.referencingFiles('b').sort()).toEqual(['a', 'c'])
        expect(g.targetsPointingAt('c', 'b')).toEqual(['notes/B'])
    })

    it('incremental updates match an independent full rebuild after a random edit sequence', () => {
        let seed = 7
        const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % n
        const names = ['A', 'B', 'C', 'D', 'E', 'F']
        const files: Record<string, string> = {}
        const links: Record<string, string[]> = {}
        // Registration order defines "first owner wins": add appends, move re-registers at the end.
        let order: string[] = []
        const g = new LinkGraph()
        const randomPath = () => `${rand(2) ? 'sub/' : ''}${names[rand(names.length)]}.md`
        for (let step = 0; step < 2000; step++) {
            const id = `f${rand(8)}`
            const op = rand(4)
            if (op === 0 && !files[id]) {
                files[id] = randomPath()
                order.push(id)
                g.addFile({id, relativePath: files[id]})
            } else if (op === 1 && files[id]) {
                g.removeFile(id)
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- plain-object map in a fuzz test
                delete files[id]
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- plain-object map in a fuzz test
                delete links[id]
                order = order.filter(o => o !== id)
            } else if (op === 2 && files[id]) {
                files[id] = randomPath()
                order = [...order.filter(o => o !== id), id]
                g.moveFile(id, files[id])
            } else if (op === 3 && files[id]) {
                links[id] = Array.from({length: rand(4)}, () => names[rand(names.length)]!)
                g.setLinks(id, links[id])
            }
        }

        const owner = new Map<string, string>()
        for (const id of order) for (const k of linkKeys(files[id]!)) if (!owner.has(k)) owner.set(k, id)
        const expectedFwd: Record<string, string[]> = {}
        const expectedBack: Record<string, string[]> = {}
        for (const id of Object.keys(files)) {
            expectedFwd[id] = [...new Set((links[id] ?? []).map(t => owner.get(t)).filter((x): x is string => !!x && x !== id))].sort()
            for (const to of expectedFwd[id]) (expectedBack[to] ??= []).push(id)
        }
        for (const id of Object.keys(files)) {
            expect(g.forelinks(id).sort(), `forelinks ${id}`).toEqual(expectedFwd[id])
            expect(g.backlinks(id).sort(), `backlinks ${id}`).toEqual((expectedBack[id] ?? []).sort())
        }
    })
})
