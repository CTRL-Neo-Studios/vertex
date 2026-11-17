import {describe, expect, it} from "vitest";
import type {Store} from "#shared/plugin/api";
import {FEEDBACK_LIMIT, feedbackIssue, recordFeedback, type FeedbackEntry} from "./feedback";

const entry = (at: number): FeedbackEntry => ({at, kind: 'bug', tool: 'moveFiles', summary: `s${at}`, details: 'd', model: 'm', chatId: 'c'})

describe('feedback', () => {
    it('keeps the newest first, at most 200, and the rest of chat\'s document', async () => {
        let doc: unknown = {other: 1, feedback: Array.from({length: FEEDBACK_LIMIT}, (_, i) => entry(FEEDBACK_LIMIT - i))}
        const store: Store<unknown> = {get: async () => doc, set: async value => { doc = value }, onChange: () => () => {}}
        await recordFeedback(store, entry(1000))
        const {other, feedback} = doc as { other: number, feedback: FeedbackEntry[] }
        expect(other).toBe(1)
        expect(feedback).toHaveLength(FEEDBACK_LIMIT)
        expect(feedback.map(e => e.at).slice(0, 2)).toEqual([1000, FEEDBACK_LIMIT])
        expect(feedback.at(-1)!.at).toBe(2)
        doc = undefined
        await recordFeedback(store, entry(5))
        expect(doc).toEqual({feedback: [entry(5)]})
    })

    it('copies as a GitHub issue: a title line and a Markdown body', () => {
        const {title, body} = feedbackIssue(entry(0))
        expect(title).toBe('[chat tool feedback] bug (moveFiles): s0')
        expect(body).toContain('**Tool:** `moveFiles`')
        expect(body).toMatch(/## Details\nd$/)
    })
})
