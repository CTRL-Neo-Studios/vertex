import {describe, expect, it} from "vitest";
import {parseMarkdown} from "@comark/vue/parse";
import {strangerMarkdown} from "./markdown";

const parse = async (md: string) => (await parseMarkdown(md, {...strangerMarkdown.options, plugins: [...strangerMarkdown.plugins]})).nodes
const tags = (nodes: unknown[]): string[] => nodes.flatMap(n => (Array.isArray(n) ? [n[0] as string, ...tags(n.slice(2))] : []))

describe('a stranger\'s Markdown', () => {
    it('keeps raw HTML, components and attributes as text', async () => {
        const nodes = await parse([
            '<script>alert(1)</script>',
            '<img src=x onerror="alert(1)">',
            '::u-button{label="x"}\n::',
            'Text {onclick="alert(1)"}',
            '<a href="javascript:alert(1)">x</a>',
        ].join('\n\n'))
        expect(tags(nodes)).toEqual(['p', 'p', 'p', 'p', 'p'])
        expect(JSON.stringify(nodes)).toContain('<script>alert(1)</script>')
    })

    it('makes no link of javascript:', async () => {
        expect(await parse('[x](javascript:alert(1))')).toEqual([['p', {}, '[x](javascript:alert(1))']])
    })

    it('draws Markdown: headings without ids, tables, task lists, links, images', async () => {
        const nodes = await parse('---\ntitle: x\n---\n# Graph\n\n| a |\n|---|\n| 1 |\n\n- [x] done\n\n[site](https://a.b) https://c.d ![pic](img.png)')
        expect(nodes[0]).toEqual(['h1', {}, 'Graph'])
        expect(tags(nodes)).toEqual(['h1', 'table', 'thead', 'tr', 'th', 'tbody', 'tr', 'td', 'ul', 'li', 'input', 'p', 'a', 'a', 'img'])
        expect(JSON.stringify(nodes)).not.toContain('title')
    })
})
