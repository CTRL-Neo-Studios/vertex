import {convertToModelMessages, generateText, isStepCount, streamText, type ChatTransport, type LanguageModel, type LanguageModelUsage, type ToolSet} from "ai";
import type {ChatRequestInfo, VertexChatMessage} from "../../shared/types";
import {markModeSwitches} from "./tools";

/** What one send uses. Resolved per send, so settings and the note context are current. */
export interface ChatSendSetup {
    /** The AI plugin's model for the profile, with its request parameters (`languageModel()`). */
    model: LanguageModel,
    profileId: string,
    modelId: string,
    /** The instructions before the notes. */
    prompt: string,
    notes: {path: string, content: string}[],
    /** Images attached in the conversation, read at send: each goes into the message that attached it. */
    images?: {messageId: string, mediaType: string, url: string}[],
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

/** A model's title reply as a title: first line, no quotes, markdown marks or closing punctuation, at most 60 characters. */
export function cleanTitle(text: string): string {
    const line = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n')[0] ?? ''
    return line.replace(/^["'“”‘’*#\s]*(?:title:\s*)?["'“”‘’*#\s]*/i, '').replace(/["'“”‘’*.。!?！？\s]+$/, '').slice(0, 60)
}

/** A 3–6 word title from a chat's first exchange; '' when the model gives nothing usable. */
export async function generateChatTitle(model: LanguageModel, question: string, answer: string): Promise<string> {
    const {text} = await generateText({
        model,
        instructions: 'You name conversations. Reply with only a 3 to 6 word title, in the language of the conversation. No quotes, no trailing punctuation.',
        prompt: `User: ${question.slice(0, 2000)}\n\nAssistant: ${answer.slice(0, 2000)}`,
    })
    return cleanTitle(text)
}

/** `bytes` as a `data:` URL, as a file part carries an image to the model. Built in chunks: a big image overflows one call's arguments. */
export function dataUrl(mediaType: string, bytes: Uint8Array) {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:${mediaType};base64,${btoa(binary)}`
}

/** `messages` with each image added to the message that attached it, as a `file` part. */
export function withImages(messages: VertexChatMessage[], images: ChatSendSetup['images'] = []) {
    for (const {messageId, mediaType, url} of images) messages.find(m => m.id === messageId)?.parts.push({type: 'file', mediaType, url})
    return messages
}

/** A chat transport that runs the model in the webview, through Rust's `ai_request` (no server route). */
export function createChatTransport(setup: (messages: VertexChatMessage[]) => Promise<ChatSendSetup>): ChatTransport<VertexChatMessage> {
    return {
        async sendMessages({messages, abortSignal}) {
            const {model, profileId, modelId, prompt, notes, images, tools} = await setup(messages)
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
                model,
                instructions: system || undefined,
                // Plain copies: the chat's messages are Vue proxies, which an approved tool call's input can't be
                // `structuredClone`d from when the AI SDK checks it again before running it. Attached images are
                // added to the copies only, as file parts: the stored chat keeps their paths, not their bytes.
                messages: await convertToModelMessages(markModeSwitches(withImages(JSON.parse(JSON.stringify(messages)), images)), {tools}),
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
