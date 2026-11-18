import {describe, expect, it} from 'vitest'
import {indexFile} from './settingsIndex'

const page = (script: string, template: string) => `<script setup lang="ts">${script}</script>\n<template>${template}</template>`
const index = (source: string) => indexFile(source, 'x.vue', '/settings/x', true)

describe('the settings index of a page', () => {
    it('reads the title, sections and rows as keys or text, each row with its section', () => {
        const {entries, unreadable} = index(page('', `
            <SettingsScrollLayout :title="t('x.title')">
                <SettingsSection title="Plain" :description="t('x.sectionHelp')">
                    <SettingsRow :label="$t('x.a')" :description="t('x.aHelp', {mod})"/>
                    <SettingsRow stacked><p>A notice</p></SettingsRow>
                </SettingsSection>
            </SettingsScrollLayout>`))
        expect(unreadable).toEqual([])
        expect(entries.map(e => [e.section ?? null, e.label, e.description ?? null])).toEqual([
            [null, 'x.title', null],
            [null, 'Plain', 'x.sectionHelp'],
            ['Plain', 'x.a', 'x.aHelp'],
        ])
        expect(entries.every(e => e.title === 'x.title' && e.page === '/settings/x')).toBe(true)
    })

    it('reads a row per value of a v-for over a constant array', () => {
        const {entries} = index(page(`const KEYS = ['one', "two"] as const`, `
            <SettingsSection :title="t('x.s')">
                <SettingsRow v-for="key in KEYS" :key :label="t(\`x.\${key}\`)" :description="t(\`x.\${key}Help\`)"/>
            </SettingsSection>`))
        expect(entries.slice(1).map(e => [e.label, e.description])).toEqual([['x.one', 'x.oneHelp'], ['x.two', 'x.twoHelp']])
    })

    it("names a row it can't read, unless it opts out", () => {
        const {unreadable} = index(page('const items = []', `
            <SettingsSection :title="t('x.s')">
                <SettingsRow v-for="item in items" :label="item.label"/>
                <SettingsRow v-for="item in items" data-no-index :label="item.label"/>
            </SettingsSection>`))
        expect(unreadable).toEqual(["x.vue:4 (a row's label)"])
    })
})
