/** UTF-8 text as URL-safe base64 without padding: for ids that are also route segments (diff tabs). */
export const toBase64Url = (text: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** The text {@link toBase64Url} encoded; throws on input that isn't. */
export const fromBase64Url = (text: string) =>
    new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)))
