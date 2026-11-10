import {invoke} from "@tauri-apps/api/core";
import {DownloadError} from "ai";
import {experimental_createWebFetchTool} from "@ai-sdk/tool-web-fetch";

/** Rust `web_fetch`'s refusal of an address on this computer or the local network. */
const LOCAL = 'refused:'
/** Statuses whose `Response` can't have a body. */
const NO_BODY = new Set([204, 205, 304])

/** A `web_fetch` reply's head (see Rust `frame`). */
interface Head {
    status: number
    statusText: string
    headers: [string, string][]
}

/** A `web_fetch` reply as a `Response`: the head's JSON length (u32, big-endian), the head, then the body. */
export function unframe(raw: ArrayBuffer): Response {
    const size = new DataView(raw).getUint32(0)
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 4, size))) as Head
    return new Response(NO_BODY.has(head.status) ? null : new Uint8Array(raw, 4 + size), head)
}

/**
 * Rust `web_fetch` as a `fetch`, for the web fetch tool: one GET, redirects returned rather than followed (the tool
 * follows each through here again), its `Accept` passed on. Rust checks every address; a refused one throws a
 * `DownloadError`, which the tool reports as a private address. An abort rejects at once (Rust gives up within 15 s).
 */
export async function rustFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString()
    const signal = init?.signal
    signal?.throwIfAborted()
    const call = invoke<ArrayBuffer>('web_fetch', {url, accept: new Headers(init?.headers).get('accept')})
    const aborted = signal && new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}))
    try {
        return unframe(await (aborted ? Promise.race([call, aborted]) : call))
    } catch (e) {
        if (signal?.aborted) throw e
        const message = e instanceof Error ? e.message : String(e)
        // The tool tells the model only "The request failed."; the reason is here.
        console.warn(`[web_fetch] ${url}: ${message}`)
        throw message.startsWith(LOCAL) ? new DownloadError({url, message}) : new Error(message)
    }
}

// linkedom's `document.defaultView` is a Proxy over the real global, so in the webview defuddle calls the webview's
// `getComputedStyle` on linkedom's elements ("Illegal invocation"), gives up and returns the whole page, menus and all.
// Answering those calls with no style, as under Node, keeps its extraction; real elements still get theirs.
// ponytail: app-wide patch; drop it once defuddle or linkedom stop reaching the real window.
if (typeof window !== 'undefined') {
    const native = window.getComputedStyle
    window.getComputedStyle = (element, pseudo) => {
        try {
            return native.call(window, element, pseudo)
        } catch (e) {
            if (e instanceof TypeError) return null as unknown as CSSStyleDeclaration
            throw e
        }
    }
}

/**
 * The AI SDK's web fetch over {@link rustFetch}, behind `fetchUrl`: Markdown first, HTML through defuddle (loaded on
 * the first page), 20 000 characters per call with `offset` paging from its cache. One for the app, so the cache
 * outlives a send.
 */
export const webFetch = experimental_createWebFetchTool({fetch: rustFetch, maxLength: 20_000, maxBytes: 2 * 1024 * 1024})
