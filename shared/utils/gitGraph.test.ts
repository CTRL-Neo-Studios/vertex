import {describe, expect, it} from "vitest";
import {graphRows, type GraphRow} from "./gitGraph";

const c = (id: string, ...parents: string[]) => ({id, parents})
/** `1: ↘1→1 ↓1→0 │0`: the dot's lane, then its lines: `↘from→to` into the dot, `↓from→to` out of it, `│` through. */
const draw = (rows: GraphRow[]) => rows.map(r => `${r.lane}:` + r.lines
    .map(l => ` ${l.half === 'full' ? `│${l.from}` : l.half === 'top' ? `↘${l.from}→${l.to}` : `↓${l.from}→${l.to}`}`)
    .join(''))

describe('graphRows', () => {
    it('keeps a linear history in one lane', () => {
        expect(draw(graphRows([c('c', 'b'), c('b', 'a'), c('a')]))).toEqual(['0: ↓0→0', '0: ↘0→0 ↓0→0', '0: ↘0→0'])
    })

    it('starts a branch tip in a free lane and joins it to a parent another lane already waits for', () => {
        // d and c both grow from b.
        expect(draw(graphRows([c('d', 'b'), c('c', 'b'), c('b', 'a'), c('a')])))
            .toEqual(['0: ↓0→0', '1: ↓1→0 │0', '0: ↘0→0 ↓0→0', '0: ↘0→0'])
    })

    it('opens a lane for a merge\'s second parent and closes it where that parent rejoins', () => {
        const rows = graphRows([c('m', 'a', 'b'), c('a', 'base'), c('b', 'base'), c('base')])
        expect(draw(rows)).toEqual(['0: ↓0→0 ↓0→1', '0: ↘0→0 ↓0→0 │1', '1: ↘1→1 ↓1→0 │0', '0: ↘0→0'])
        expect(rows.map(r => r.width)).toEqual([2, 2, 2, 1])
    })

    it('fans an octopus merge out into one lane per parent', () => {
        const rows = graphRows([c('o', 'a', 'b', 'c'), c('a'), c('b'), c('c')])
        expect(draw(rows)[0]).toBe('0: ↓0→0 ↓0→1 ↓0→2')
        expect(rows.map(r => r.lane)).toEqual([0, 0, 1, 2])
        // Lanes stay where they are while others end: b and c keep lanes 1 and 2.
        expect(draw(rows)[1]).toBe('0: ↘0→0 │1 │2')
    })

    it('reuses a lane a finished branch left free, and keeps lanes open for parents not loaded yet', () => {
        const rows = graphRows([c('x', 'p'), c('y', 'q'), c('p'), c('z', 'r')])
        // y opens lane 1; p ends lane 0; z, a new tip, takes the free lane 0 while y's parent q still waits in lane 1.
        expect(rows.map(r => r.lane)).toEqual([0, 1, 0, 0])
        expect(draw(rows)[3]).toBe('0: ↓0→0 │1')
    })
})
