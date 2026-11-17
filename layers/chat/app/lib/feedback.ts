import type {Store} from "#shared/plugin/api";

/** `toolFeedback`'s input; see the tool's schema. */
export interface FeedbackInput {
    kind: 'missing' | 'bug' | 'confusing'
    tool?: string
    summary: string
    details: string
}

/** A `toolFeedback` call as kept: when (ms), the model that made it and its chat. */
export interface FeedbackEntry extends FeedbackInput {
    at: number
    model: string
    chatId: string
}

/** Chat's document in `ctx.data.global`. */
export interface ChatGlobalData {
    /** Newest first. */
    feedback?: FeedbackEntry[]
}

export const FEEDBACK_LIMIT = 200

/** `list` with `entry` first, cut to the newest {@link FEEDBACK_LIMIT}. */
export const withFeedback = (list: FeedbackEntry[] | undefined, entry: FeedbackEntry) => [entry, ...list ?? []].slice(0, FEEDBACK_LIMIT)

/** Keeps `entry` in chat's global document (this computer only; nothing is sent). */
export async function recordFeedback(store: Store<unknown>, entry: FeedbackEntry) {
    const data = (await store.get() ?? {}) as ChatGlobalData
    await store.set({...data, feedback: withFeedback(data.feedback, entry)})
}

/** An entry as a GitHub issue: a title line and a Markdown body, for the user to paste. */
export function feedbackIssue(entry: FeedbackEntry): { title: string, body: string } {
    const title = `[chat tool feedback] ${entry.kind}${entry.tool ? ` (${entry.tool})` : ''}: ${entry.summary}`
    const body = [
        `**Kind:** ${entry.kind}`,
        ...(entry.tool ? [`**Tool:** \`${entry.tool}\``] : []),
        `**Model:** ${entry.model}`,
        `**When:** ${new Date(entry.at).toISOString()}`,
        '',
        '## Summary',
        entry.summary,
        '',
        '## Details',
        entry.details,
    ].join('\n')
    return {title, body}
}
