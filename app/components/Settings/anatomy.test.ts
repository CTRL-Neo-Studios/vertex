import {globSync, readFileSync} from 'node:fs'
import {parse} from '@vue/compiler-sfc'
import {describe, expect, it} from 'vitest'

/**
 * A settings page's anatomy, held in the sources (Settings Plan, U1): a `SettingsSection`'s content is `SettingsRow`s
 * and nothing else, so nothing pads by hand and every page lines up. A full-width control, a notice or a preview is a
 * `stacked` row; "nothing here yet" is the section's `empty`.
 */
const ROWS = new Set(['SettingsRow'])

interface Node {
    type: number
    tag?: string
    props?: { name: string }[]
    children?: Node[]
    loc: { start: { line: number } }
}
const ELEMENT = 1

/** What sits directly in a `SettingsSection` of a component's template besides rows and its named slots, as `tag:line`. */
export function strayChildren(source: string): string[] {
    const stray: string[] = []
    // A `<template v-if>` or `v-for` stands for its children; a `<template #actions>` is the section's own slot.
    const check = (node: Node) => {
        if (node.tag === 'template') {
            if (!node.props?.some(p => p.name === 'slot')) node.children?.forEach(child => child.type === ELEMENT && check(child))
        } else if (!ROWS.has(node.tag!)) stray.push(`${node.tag}:${node.loc.start.line}`)
    }
    const walk = (node: Node) => {
        for (const child of node.children ?? []) {
            if (child.type !== ELEMENT) continue
            if (node.tag === 'SettingsSection') check(child)
            walk(child)
        }
    }
    const template = parse(source).descriptor.template?.ast
    if (template) walk(template as unknown as Node)
    return stray
}

describe("a settings section's content", () => {
    it('is told apart: rows and slots pass, anything else is named', () => {
        const page = (inside: string) => `<template><SettingsSection title="x">${inside}</SettingsSection></template>`
        expect(strayChildren(page('<template #actions><UButton/></template><SettingsRow label="a"/><template v-if="b"><SettingsRow stacked><UAlert/></SettingsRow></template>'))).toEqual([])
        expect(strayChildren(page('<SettingsRow label="a"/><div class="px-4 py-2.5"><UTextarea/></div>'))).toEqual(['div:1'])
        expect(strayChildren(page('<template v-if="empty"><p class="px-4">None</p></template>'))).toEqual(['p:1'])
    })

    it('is rows in every page of the app and of the core plugins', () => {
        const files = [...globSync('app/**/*.vue'), ...globSync('layers/*/app/**/*.vue')]
        const stray = files.flatMap(file => strayChildren(readFileSync(file, 'utf8')).map(at => `${file}: ${at}`))
        expect(files.length).toBeGreaterThan(0)
        expect(stray).toEqual([])
    })
})
