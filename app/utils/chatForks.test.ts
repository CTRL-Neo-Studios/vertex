import {describe, expect, it} from "vitest";
import {branchAt, fork, pruneForks, switchBranch} from "~/utils/chatForks";

type M = { id: string }
const msgs = (...ids: string[]): M[] => ids.map(id => ({id}))
const ids = (list: M[]) => list.map(m => m.id).join(' ')

describe('chat branches', () => {
    it('forks, then switches back and forth without losing either branch', () => {
        const forks: Record<string, (M[] | null)[]> = {}
        // An edit of u2: everything from it on becomes branch 1, the new u2' starts branch 2.
        const edited = [...fork(forks, msgs('u1', 'a1', 'u2', 'a2'), 2), ...msgs('u2b', 'a2b')]
        expect(branchAt(forks, edited, 2)).toEqual({index: 1, count: 2})
        expect(branchAt(forks, edited, 1)).toBeUndefined()

        const back = switchBranch(forks, edited, 2, 0)
        expect(ids(back)).toBe('u1 a1 u2 a2')
        expect(branchAt(forks, back, 2)).toEqual({index: 0, count: 2})
        expect(ids(switchBranch(forks, back, 2, 1))).toBe('u1 a1 u2b a2b')
    })

    it('adds a third branch at the same point, and forks at the start', () => {
        const forks: Record<string, (M[] | null)[]> = {}
        let list = [...fork(forks, msgs('u1', 'a1'), 1), ...msgs('a1b')]
        list = [...fork(forks, list, 1), ...msgs('a1c')]
        expect(branchAt(forks, list, 1)).toEqual({index: 2, count: 3})
        expect(ids(switchBranch(forks, list, 1, 0))).toBe('u1 a1')

        const start: Record<string, (M[] | null)[]> = {}
        expect(fork(start, msgs('u1', 'a1'), 0)).toEqual([])
        expect(branchAt(start, msgs('u1b'), 0)).toEqual({index: 1, count: 2})
    })

    it('keeps forks inside a hidden branch, and drops the ones a rewind cut off', () => {
        const forks: Record<string, (M[] | null)[]> = {}
        // A retry of a2 inside the first branch, then an edit of u2 hides that whole branch.
        let list = [...fork(forks, msgs('u1', 'a1', 'u2', 'a2'), 3), ...msgs('a2b')]
        list = [...fork(forks, list, 2), ...msgs('u2c')]
        pruneForks(forks, list)
        expect(Object.keys(forks).sort()).toEqual(['a1', 'u2'])

        // Rewind to a1: the fork after it (u2's edit) and the one inside it (a2's retry) both go.
        pruneForks(forks, list.slice(0, 2))
        expect(forks).toEqual({})
    })
})
