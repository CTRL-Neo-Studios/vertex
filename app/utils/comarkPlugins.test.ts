import {describe, expect, it} from "vitest";
import {parseMarkdown} from "@comark/nuxt/parse";
import {callouts, wikiLinks} from "./comarkPlugins";

const parse = async (md: string) => (await parseMarkdown(md, {plugins: [wikiLinks, callouts]})).nodes

describe('callouts', () => {
    it('keeps the title line and the body apart', async () => {
        expect(await parse('> [!warning] Mind the gap\n> Body line')).toEqual([
            ['callout', {color: 'warning', icon: 'i-lucide-triangle-alert'}, ['strong', {}, 'Mind the gap'], ['p', {class: 'my-1'}, 'Body line']],
        ])
    })

    it('titles an untitled callout after its type, and folds its body text into the body', async () => {
        expect(await parse('> [!tip]\n> Untitled tip')).toEqual([
            ['callout', {color: 'success', icon: 'i-lucide-flame'}, ['strong', {}, 'Tip'], ['p', {class: 'my-1'}, 'Untitled tip']],
        ])
    })

    it('accepts aliases, unknown types and the fold marker', async () => {
        const [faq] = await parse('> [!faq]- Folded question\n> Answer')
        expect(faq).toEqual(['callout', {color: 'warning', icon: 'i-lucide-circle-help'}, ['strong', {}, 'Folded question'], ['p', {class: 'my-1'}, 'Answer']])
        const [custom] = await parse('> [!recipe] Soup')
        expect(custom).toEqual(['callout', {color: 'info', icon: 'i-lucide-pencil'}, ['strong', {}, 'Soup']])
    })

    it('keeps later paragraphs of a multi-paragraph callout', async () => {
        const [node] = await parse('> [!note] Title\n> First\n>\n> Second')
        expect(node?.[0]).toBe('callout')
        expect(JSON.stringify(node)).toContain('Second')
        expect(JSON.stringify(node)).toContain('First')
    })

    it('leaves plain blockquotes alone', async () => {
        expect(await parse('> just a quote')).toEqual([['blockquote', {}, 'just a quote']])
    })
})

describe('wikiLinks', () => {
    it('turns [[Target|Alias]] into a note link and leaves code alone', async () => {
        expect(await parse('See [[Note 1|the note]] and `[[not a link]]`')).toEqual([
            ['p', {}, 'See ', ['a', {note: 'Note 1'}, 'the note'], ' and ', ['code', {}, '[[not a link]]']],
        ])
    })
})
