import {vertexInvoke} from "~/utils/vertexInvoke";

/** Statuses whose `Response` can't have a body. */
const NO_BODY = new Set([204, 205, 304])

/** An `http_fetch` reply's head (see Rust `frame`). */
interface Head {
    status: number
    statusText: string
    headers: [string, string][]
}

/** An `http_fetch` reply as a `Response`: the head's JSON length (u32, big-endian), the head, then the body. */
export function unframe(raw: ArrayBuffer): Response {
    const size = new DataView(raw).getUint32(0)
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 4, size))) as Head
    return new Response(NO_BODY.has(head.status) ? null : new Uint8Array(raw, 4 + size), head)
}

/**
 * The kernel's `http_fetch` (`ctx.http.fetch`): one GET from Rust, outside the webview's CORS, with `init`'s `Accept`
 * passed on; redirects are returned, not followed; the body stops past 2 MiB. Rust refuses addresses on this computer
 * or the local network (the error message starts with `refused:`). An abort rejects at once (Rust gives up within 15 s).
 */
export async function httpFetch(url: string, init?: { headers?: HeadersInit, signal?: AbortSignal | null }): Promise<Response> {
    const signal = init?.signal
    signal?.throwIfAborted()
    const call = vertexInvoke<ArrayBuffer>('http_fetch', {url, accept: new Headers(init?.headers).get('accept')})
    const aborted = signal && new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}))
    try {
        return unframe(await (aborted ? Promise.race([call, aborted]) : call))
    } catch (e) {
        // Rust's errors arrive as strings.
        throw signal?.aborted || e instanceof Error ? e : new Error(String(e))
    }
}
