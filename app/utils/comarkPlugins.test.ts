import {describe, expect, it} from "vitest";
import {createMarkdownParser, parseMarkdown} from "@comark/nuxt/parse";
import {callouts, frontmatterAsCode, wikiLinks} from "./comarkPlugins";

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

    it('accepts aliases and unknown types', async () => {
        const [faq] = await parse('> [!faq] Question\n> Answer')
        expect(faq).toEqual(['callout', {color: 'warning', icon: 'i-lucide-circle-help'}, ['strong', {}, 'Question'], ['p', {class: 'my-1'}, 'Answer']])
        const [custom] = await parse('> [!recipe] Soup')
        expect(custom).toEqual(['callout', {color: 'info', icon: 'i-lucide-pencil'}, ['strong', {}, 'Soup']])
    })

    it('keeps inline formatting in the title line', async () => {
        const [node] = await parse('> [!tip] A **bold** `title`\n> Body *x*')
        expect(node).toEqual(['callout', {color: 'success', icon: 'i-lucide-flame'},
            ['strong', {}, 'A ', ['strong', {}, 'bold'], ' ', ['code', {}, 'title']],
            ['p', {class: 'my-1'}, 'Body ', ['em', {}, 'x']]])
    })

    it('folds the body under the title line: `-` closed, `+` open', async () => {
        const [closed] = await parse('> [!faq]- Folded question\n> Answer')
        const summary = ['summary', {class: expect.any(String)},
            ['icon', {name: 'i-lucide-circle-help', class: expect.any(String)}],
            ['strong', {}, 'Folded question'],
            ['icon', {name: 'i-lucide-chevron-right', class: expect.any(String)}]]
        expect(closed).toEqual(['callout', {color: 'warning'}, ['details', {class: 'group/fold'}, summary, ['p', {class: 'my-1'}, 'Answer']]])
        const [open] = await parse('> [!note]+\n> Body')
        const details = open?.[2] as unknown[]
        expect(details.slice(0, 2)).toEqual(['details', {open: true, class: 'group/fold'}])
        expect((details[2] as unknown[])[3]).toEqual(['strong', {}, 'Note'])
        expect(details[3]).toEqual(['p', {class: 'my-1'}, 'Body'])
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

describe('frontmatterAsCode', () => {
    const plugins = [wikiLinks, callouts, frontmatterAsCode]
    const streamed = async (md: string) => (await createMarkdownParser({plugins})(md, {streaming: true})).nodes
    const yamlBlock = (code: string) => ['pre', expect.objectContaining({language: 'yaml'}), ['code', {class: 'language-yaml'}, code]]

    it('shows a quoted note\'s frontmatter as a yaml block, also while a key is half-streamed', async () => {
        expect(await streamed('---\ncover: Kthalatir/Kthalatir.png\ntags')).toEqual([yamlBlock('cover: Kthalatir/Kthalatir.png\ntags')])
        const whole = await streamed('---\ncover: a.png\ntags:\n  - k\n---\n# Title')
        expect(whole[0]).toEqual(yamlBlock('cover: a.png\ntags:\n  - k'))
        expect(whole[1]?.[0]).toBe('h1')
    })

    it('leaves a leading horizontal rule, and a `---` block later on, alone', async () => {
        const parsed = async (md: string) => (await parseMarkdown(md, {plugins})).nodes
        expect((await parsed('---\n\nText')).map(n => n[0])).toEqual(['hr', 'p'])
        expect((await parsed('Intro\n\n---\nkey: value\n---')).some(n => n[0] === 'pre')).toBe(false)
    })
})
