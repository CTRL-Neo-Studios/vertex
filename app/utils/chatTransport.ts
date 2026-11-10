import {convertToModelMessages, generateText, isStepCount, streamText, type ChatTransport, type LanguageModelUsage, type ToolSet} from "ai";
import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
import type {AiModelParams, AiProviderProfile} from "#shared/types/app/ai";
import type {ChatRequestInfo, VertexChatMessage} from "#shared/types/app/chats";
import {createAiFetch} from "~/utils/aiFetch";
import {markModeSwitches} from "~/utils/chatTools";

/** What one send uses. Resolved per send, so settings and the note context are current. */
export interface ChatSendSetup {
    provider: AiProviderProfile,
    profileId: string,
    modelId: string,
    /** The profile's request parameters (not the title's). */
    params?: AiModelParams,
    /** The instructions before the notes. */
    prompt: string,
    notes: {path: string, content: string}[],
    /** The chat's tools (`chatTools`); omitted when the model profile has them off. */
    tools?: ToolSet,
}

/** Model calls in one reply, tool rounds included. */
const MAX_STEPS = 8

// ponytail: fixed character cap over all notes, first come first served; budget by the model's context length if it matters.
const NOTE_CONTEXT_CHARS = 60_000

/**
 * The system prompt: the profile's prompt, then the notes (deduped by path, capped at {@link NOTE_CONTEXT_CHARS} in
 * total), with what was sent of each.
 */
export function chatSystem(prompt: string, notes: {path: string, content: string}[]) {
    const seen = new Set<string>()
    const blocks: string[] = []
    const sent: {path: string, chars: number}[] = []
    let budget = NOTE_CONTEXT_CHARS
    for (const {path, content} of notes) {
        if (budget <= 0) break
        if (seen.has(path)) continue
        seen.add(path)
        const text = content.slice(0, budget)
        budget -= text.length
        blocks.push(`<note path="${path}">\n${text}\n</note>`)
        sent.push({path, chars: text.length})
    }
    const context = blocks.length ? `The user's notes (link to one as [[its path]]):\n\n${blocks.join('\n\n')}` : ''
    return {system: [prompt, context].filter(Boolean).join('\n\n'), sent}
}

const usageOf = (u: LanguageModelUsage): ChatRequestInfo['usage'] => ({
    input: u.inputTokens,
    output: u.outputTokens,
    reasoning: u.outputTokenDetails?.reasoningTokens,
    cachedInput: u.inputTokenDetails?.cacheReadTokens,
})

// `includeUsage`: streamed replies only report tokens when asked (`stream_options.include_usage`).
const modelFor = (provider: AiProviderProfile, modelId: string, params?: AiModelParams) =>
    createOpenAICompatible({name: 'vertex', baseURL: provider.baseURL, fetch: createAiFetch(provider.id, params), includeUsage: true}).chatModel(modelId)

/** A model's title reply as a title: first line, no quotes, markdown marks or closing punctuation, at most 60 characters. */
export function cleanTitle(text: string): string {
    const line = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n')[0] ?? ''
    return line.replace(/^["'“”‘’*#\s]*(?:title:\s*)?["'“”‘’*#\s]*/i, '').replace(/["'“”‘’*.。!?！？\s]+$/, '').slice(0, 60)
}

/** A 3–6 word title from a chat's first exchange; '' when the model gives nothing usable. */
export async function generateChatTitle(provider: AiProviderProfile, modelId: string, question: string, answer: string): Promise<string> {
    const {text} = await generateText({
        model: modelFor(provider, modelId),
        instructions: 'You name conversations. Reply with only a 3 to 6 word title, in the language of the conversation. No quotes, no trailing punctuation.',
        prompt: `User: ${question.slice(0, 2000)}\n\nAssistant: ${answer.slice(0, 2000)}`,
    })
    return cleanTitle(text)
}

// ponytail: fixed character cap on the diff, its start kept; summarise per file if long commits need it.
const COMMIT_DIFF_CHARS = 16_000

/** What a commit message is written from. */
export interface CommitContext {
    /** Every file the commit takes, with git's status letter (`M notes/a.md`, `? new.md`). */
    files: string[],
    /** The patch of what it takes; new files are only listed. */
    diff: string,
    /** Recent commit subjects, newest first: the repository's style. */
    subjects: string[],
}

/** The commit-message prompt: recent subjects, the files, and the diff cut at {@link COMMIT_DIFF_CHARS} (saying so). */
export function commitPrompt({files, diff, subjects}: CommitContext): string {
    const cut = diff.length > COMMIT_DIFF_CHARS
    return [
        subjects.length ? `Recent commit subjects:\n${subjects.map(s => `- ${s}`).join('\n')}` : '',
        `Files in this commit:\n${files.join('\n')}`,
        diff ? `Diff${cut ? ` (its first ${COMMIT_DIFF_CHARS} of ${diff.length} characters)` : ''}:\n${diff.slice(0, COMMIT_DIFF_CHARS)}` : '',
    ].filter(Boolean).join('\n\n')
}

/** A model's commit message without reasoning, a code fence or wrapping quotes. */
export function cleanCommitMessage(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        .replace(/^```[^\n]*\n/, '').replace(/\n?```$/, '').trim()
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
}

/** A commit message for `context`, in the style of the repository's recent subjects; '' when the model gives nothing. */
export async function generateCommitMessage(provider: AiProviderProfile, modelId: string, context: CommitContext): Promise<string> {
    const {text} = await generateText({
        model: modelFor(provider, modelId),
        instructions: 'You write git commit messages. Reply with only the message: a subject line of at most 72 characters saying what the change does, then, only if it needs explaining, a blank line and a short body. Follow the style and language of the recent subjects when there are any. No quotes, no code fences.',
        prompt: commitPrompt(context),
    })
    return cleanCommitMessage(text)
}

/** A chat transport that runs the model in the webview, through Rust's `ai_request` (no server route). */
export function createChatTransport(setup: (messages: VertexChatMessage[]) => Promise<ChatSendSetup>): ChatTransport<VertexChatMessage> {
    return {
        async sendMessages({messages, abortSignal}) {
            const {provider, profileId, modelId, params, prompt, notes, tools} = await setup(messages)
            const {system, sent} = chatSystem(prompt, notes)
            const names = Object.entries(tools ?? {})
            const request: ChatRequestInfo = {
                profileId,
                modelId,
                startedAt: Date.now(),
                prompt,
                notes: sent,
                tools: {loaded: names.filter(([, t]) => !t.deferLoading).map(([n]) => n), deferred: names.filter(([, t]) => t.deferLoading).map(([n]) => n)},
            }
            // A tool round continues the last reply: its earlier calls stay listed (metadata arrays replace, not merge).
            const last = messages.at(-1)
            const earlier = last?.role === 'assistant' ? last.metadata?.requests ?? [] : []
            return streamText({
                model: modelFor(provider, modelId, params),
                instructions: system || undefined,
                // Plain copies: the chat's messages are Vue proxies, which an approved tool call's input can't be
                // `structuredClone`d from when the AI SDK checks it again before running it.
                messages: await convertToModelMessages(markModeSwitches(JSON.parse(JSON.stringify(messages))), {tools}),
                ...(tools && {tools, stopWhen: isStepCount(MAX_STEPS)}),
                abortSignal,
            })
                .toUIMessageStream<VertexChatMessage>({
                    sendReasoning: true,
                    messageMetadata: ({part}) => {
                        if (part.type === 'start') return {requests: [...earlier, request]}
                        if (part.type !== 'finish') return undefined
                        Object.assign(request, {finishedAt: Date.now(), finishReason: part.finishReason, usage: usageOf(part.totalUsage)})
                        return {modelId, profileId, requests: [...earlier, request]}
                    },
                    // The default hides every error as "An error occurred."
                    onError: error => error instanceof Error ? error.message : String(error),
                })
        },
        reconnectToStream: async () => null,
    }
}
