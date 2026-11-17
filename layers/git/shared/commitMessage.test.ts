import {describe, expect, it} from "vitest";
import {cleanCommitMessage, commitPrompt} from "./commitMessage";

describe('commitPrompt', () => {
    it('trims a large diff to its start and says so, keeping the files and subjects', () => {
        const prompt = commitPrompt({files: ['M a.md'], diff: `+start\n${'x'.repeat(40_000)}\n+end`, subjects: ['Add notes']})
        expect(prompt).toContain('- Add notes')
        expect(prompt).toContain('M a.md')
        expect(prompt).toContain('+start')
        expect(prompt).not.toContain('+end')
        expect(prompt).toMatch(/first 16000 of 40012 characters/)
    })

    it('leaves out what there is none of', () => {
        expect(commitPrompt({files: ['? new.md'], diff: '', subjects: []})).toBe('Files in this commit:\n? new.md')
    })
})

describe('cleanCommitMessage', () => {
    it('drops reasoning, a code fence and wrapping quotes, keeping the body', () => {
        expect(cleanCommitMessage('<think>diff…</think>\n```text\nAdd soup notes\n\nThree recipes.\n```')).toBe('Add soup notes\n\nThree recipes.')
        expect(cleanCommitMessage('"Fix typo in Hub"')).toBe('Fix typo in Hub')
    })
})
