import {describe, expect, it} from 'vitest'
import {MENU_LAYOUT, menuSections, resolveMenu} from './commands'

describe('resolveMenu', () => {
    it('disables items with no registered handler', () => {
        const save = resolveMenu({}).find(e => e.id === 'file.save')!
        expect(save.enabled).toBe(false)
        expect(save.run).toBeUndefined()
    })

    it('enables registered handlers and respects their enabled() guard', () => {
        const run = () => {}
        const entries = resolveMenu({'file.save': {run}, 'file.newFolder': {run, enabled: () => false}})
        expect(entries.find(e => e.id === 'file.save')).toMatchObject({enabled: true, run})
        expect(entries.find(e => e.id === 'file.newFolder')!.enabled).toBe(false)
    })

    it('every layout id is unique and has an i18n label key', () => {
        const ids = MENU_LAYOUT.map(i => i.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const item of MENU_LAYOUT) expect(item.label).toMatch(/^app\.commands\./)
    })
})

describe('menuSections', () => {
    it('inserts a separator only between groups', () => {
        const file = menuSections(resolveMenu({})).get('file')!
        expect(file.map(e => e?.id ?? '---')).toEqual([
            'file.newFile', 'file.newFolder', 'file.newWorkflow', '---', 'file.openFile', 'file.openFolder', '---', 'file.save',
        ])
    })
})
