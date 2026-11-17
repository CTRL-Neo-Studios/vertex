import {DownloadError} from "ai";
import {experimental_createWebFetchTool} from "@ai-sdk/tool-web-fetch";

/** `ctx.http.fetch`'s refusal of an address on this computer or the local network (Rust `http_fetch`'s message). */
const LOCAL = 'refused:'

/**
 * The kernel's `ctx.http.fetch` (one GET from Rust) as a `fetch`, for the web fetch tool (which follows each redirect
 * through here again). A refused address throws a `DownloadError`, which the tool reports as a private address.
 */
export async function rustFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString()
    // Loaded here, not at the top: the tools' tests import this file without the plugin's runtime.
    const {chatContext} = await import("../plugin")
    try {
        return await chatContext().http.fetch(url, init)
    } catch (e) {
        if (init?.signal?.aborted) throw e
        const message = e instanceof Error ? e.message : String(e)
        // The tool tells the model only "The request failed."; the reason is here.
        console.warn(`[http_fetch] ${url}: ${message}`)
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
