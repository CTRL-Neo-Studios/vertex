import {describe, expect, it} from "vitest";
import {unframe} from "./webPage";

/** A reply as Rust `frame` builds it. */
const framed = (head: object, body = '') => {
    const json = new TextEncoder().encode(JSON.stringify(head))
    const bytes = new Uint8Array([0, 0, 0, 0, ...json, ...new TextEncoder().encode(body)])
    new DataView(bytes.buffer).setUint32(0, json.length)
    return bytes.buffer
}

describe('unframe', () => {
    it('gives the tool a Response with the status, headers and body, a redirect unfollowed', async () => {
        const page = unframe(framed({status: 200, statusText: 'OK', headers: [['content-type', 'text/html; charset=utf-8']]}, '<p>héllo</p>'))
        expect([page.status, page.headers.get('content-type'), await page.text()]).toEqual([200, 'text/html; charset=utf-8', '<p>héllo</p>'])
        const moved = unframe(framed({status: 301, statusText: 'Moved Permanently', headers: [['location', 'https://example.com/']]}))
        expect([moved.status, moved.ok, moved.headers.get('location')]).toEqual([301, false, 'https://example.com/'])
        expect(unframe(framed({status: 204, statusText: 'No Content', headers: []})).body).toBeNull()
    })
})
