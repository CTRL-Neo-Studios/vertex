import {expect, it} from "vitest";
import {diffSpecOf, diffTabId} from "./gitDiff";

it('round-trips any path through a URL-safe tab id', () => {
    const spec = {top: '/Users/me/My Vault', path: '笔记/第一章 [草稿]?#.md', side: 'staged', origPath: 'old/名.md'}
    const id = diffTabId(spec)
    expect(id).toMatch(/^diff-[A-Za-z0-9_-]+$/)
    expect(diffSpecOf(id)).toEqual(spec)
    expect(diffSpecOf(diffTabId({top: '/r', path: 'a.md', side: 'worktree'}))).toEqual({top: '/r', path: 'a.md', side: 'worktree'})
})

it('reads other ids as no diff', () => {
    expect(diffSpecOf('3f2a9c1e-0000-4000-8000-000000000000')).toBeUndefined()
    expect(diffSpecOf('diff-not*json')).toBeUndefined()
})
