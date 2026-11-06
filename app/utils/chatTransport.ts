import {convertToModelMessages, generateText, isStepCount, streamText, type ChatTransport, type ToolSet} from "ai";
import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
import type {AiProviderProfile} from "#shared/types/app/ai";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {createAiFetch} from "~/utils/aiFetch";

/** What one send uses. Resolved per send, so settings and the note context are current. */
export interface ChatSendSetup {
    provider: AiProviderProfile,
    profileId: string,
    modelId: string,
    system: string,
    /** The chat's tools (`chatTools`); omitted when the model profile has them off. */
    tools?: ToolSet,
}

/** Model calls in one reply, tool rounds included. */
const MAX_STEPS = 8

// ponytail: fixed character cap over all notes, first come first served; budget by the model's context length if it matters.
const NOTE_CONTEXT_CHARS = 60_000

/** The system prompt: the profile's prompt, then the notes (deduped by path, capped at {@link NOTE_CONTEXT_CHARS} in total). */
export function chatSystem(prompt: string, notes: {path: string, content: string}[]): string {
    const seen = new Set<string>()
    const blocks: string[] = []
    let budget = NOTE_CONTEXT_CHARS
    for (const {path, content} of notes) {
        if (budget <= 0) break
        if (seen.has(path)) continue
        seen.add(path)
        const text = content.slice(0, budget)
        budget -= text.length
        blocks.push(`<note path="${path}">\n${text}\n</note>`)
    }
    const context = blocks.length ? `The user's notes (link to one as [[its path]]):\n\n${blocks.join('\n\n')}` : ''
    return [prompt, context].filter(Boolean).join('\n\n')
}

const modelFor = (provider: AiProviderProfile, modelId: string) =>
    createOpenAICompatible({name: 'vertex', baseURL: provider.baseURL, fetch: createAiFetch(provider.id)}).chatModel(modelId)

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

/** A chat transport that runs the model in the webview, through Rust's `ai_request` (no server route). */
export function createChatTransport(setup: (messages: VertexChatMessage[]) => Promise<ChatSendSetup>): ChatTransport<VertexChatMessage> {
    return {
        async sendMessages({messages, abortSignal}) {
            const {provider, profileId, modelId, system, tools} = await setup(messages)
            return streamText({
                model: modelFor(provider, modelId),
                instructions: system || undefined,
                messages: await convertToModelMessages(messages, {tools}),
                ...(tools && {tools, stopWhen: isStepCount(MAX_STEPS)}),
                abortSignal,
            })
                .toUIMessageStream<VertexChatMessage>({
                    sendReasoning: true,
                    messageMetadata: ({part}) => part.type === 'finish' ? {modelId, profileId} : undefined,
                    // The default hides every error as "An error occurred."
                    onError: error => error instanceof Error ? error.message : String(error),
                })
        },
        reconnectToStream: async () => null,
    }
}
