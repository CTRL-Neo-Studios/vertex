import {convertToModelMessages, streamText, type ChatTransport} from "ai";
import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
import type {AiProviderProfile} from "#shared/types/app/ai";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {createAiFetch} from "~/utils/aiFetch";

/** What one send uses. Resolved per send, so settings and the note context are current. */
export interface ChatSendSetup {
    provider: AiProviderProfile,
    modelId: string,
    system: string,
}

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

/** A chat transport that runs the model in the webview, through Rust's `ai_request` (no server route). */
export function createChatTransport(setup: (messages: VertexChatMessage[]) => Promise<ChatSendSetup>): ChatTransport<VertexChatMessage> {
    return {
        async sendMessages({messages, abortSignal}) {
            const {provider, modelId, system} = await setup(messages)
            const model = createOpenAICompatible({name: 'vertex', baseURL: provider.baseURL, fetch: createAiFetch(provider.id)}).chatModel(modelId)
            return streamText({model, instructions: system || undefined, messages: await convertToModelMessages(messages), abortSignal})
                .toUIMessageStream<VertexChatMessage>({
                    sendReasoning: true,
                    messageMetadata: ({part}) => part.type === 'finish' ? {modelId} : undefined,
                    // The default hides every error as "An error occurred."
                    onError: error => error instanceof Error ? error.message : String(error),
                })
        },
        reconnectToStream: async () => null,
    }
}
