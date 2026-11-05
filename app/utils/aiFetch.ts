import {Channel} from "@tauri-apps/api/core";
import {aiClient, type AiChunk} from "~/utils/aiClient";

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')
/** Statuses whose `Response` must have a null body. */
const NULL_BODY = new Set([101, 103, 204, 205, 304])

/**
 * A `fetch` for one AI provider that goes through Rust (`ai_request`), which adds the provider's API key from
 * the keychain: the key never enters the webview, and there's no CORS. Resolves once the headers arrive and
 * streams the body, so ai-sdk's streaming works unchanged. Only string bodies (ai-sdk sends JSON strings).
 */
export function createAiFetch(providerId: string): typeof fetch {
    return async (input, init) => {
        const request = input instanceof Request ? input : undefined
        const url = request ? request.url : String(input)
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
        const headers = Object.fromEntries(new Headers(init?.headers ?? request?.headers).entries())
        const body = init?.body ?? (request?.body ? await request.text() : undefined)
        if (body != null && typeof body !== 'string') throw new TypeError('AI requests only take string bodies')
        const signal = init?.signal ?? request?.signal
        if (signal?.aborted) throw abortError()

        const requestId = crypto.randomUUID()
        const response = Promise.withResolvers<Response>()
        let controller!: ReadableStreamDefaultController<Uint8Array>
        let settled = false
        const onAbort = () => {
            finish(abortError())
            response.reject(abortError())
        }
        /** Ends the body (`error` = failed) once; anything still running in Rust is cancelled. */
        function finish(error?: unknown, cancel = error !== undefined) {
            if (settled) return
            settled = true
            signal?.removeEventListener('abort', onAbort)
            if (cancel) void aiClient.cancelRequest(requestId).catch(() => {})
            if (error === undefined) controller.close()
            else controller.error(error)
        }

        const stream = new ReadableStream<Uint8Array>({
            start: c => { controller = c },
            // The reader gave up on the body: stop the download too.
            cancel: () => {
                if (settled) return
                settled = true
                signal?.removeEventListener('abort', onAbort)
                void aiClient.cancelRequest(requestId).catch(() => {})
            },
        })
        const channel = new Channel<AiChunk>(message => {
            if (settled) return
            if (message instanceof ArrayBuffer) controller.enqueue(new Uint8Array(message))
            else if (message.error !== undefined) finish(signal?.aborted ? abortError() : new Error(message.error), false)
            else if (message.end) finish(undefined, false)
        })

        signal?.addEventListener('abort', onAbort, {once: true})
        aiClient.request({requestId, providerId, url, method, headers, body: body ?? null, onChunk: channel}).then(
            head => response.resolve(new Response(NULL_BODY.has(head.status) ? null : stream, {status: head.status, headers: head.headers})),
            error => {
                const failure = signal?.aborted ? abortError() : new Error(String(error))
                finish(failure, false)
                response.reject(failure)
            },
        )
        return response.promise
    }
}
