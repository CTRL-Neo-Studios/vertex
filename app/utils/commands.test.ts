import {describe, expect, it} from 'vitest'
import {MENU_LAYOUT, menuSections, registerCommand, registeredCommands, resolveMenu, type RegisteredCommand} from './commands'

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
            'file.newFile', 'file.newFolder', '---', 'file.newWorkspace', 'file.openFile', 'file.openFolder', '---', 'file.save',
        ])
    })
})

describe('registered commands', () => {
    const command = (id: string, extra: Partial<RegisteredCommand> = {}): RegisteredCommand =>
        ({id, plugin: id.split(':')[0]!, label: `plugins.${id}`, run() {}, ...extra})

    it('go into their group after the kernel\'s items, in registration order; without a group, at the end', () => {
        const registered = [
            command('b:late', {menu: {section: 'view', group: 1}}),
            command('a:first', {menu: {section: 'view'}, enabled: () => false}),
            command('a:second', {menu: {section: 'view'}}),
            command('a:palette-only', {palette: true}),
            command('c:new', {menu: {section: 'file', group: 0}}),
        ]
        const sections = menuSections(resolveMenu({}, registered))
        const view = sections.get('view')!
        expect(view.map(e => e?.id ?? '---').slice(-6)).toEqual(['view.closeAllTabs', 'view.closeWindow', 'b:late', '---', 'a:first', 'a:second'])
        expect(sections.get('file')!.slice(0, 4).map(e => e?.id ?? '---')).toEqual(['file.newFile', 'file.newFolder', 'c:new', '---'])
        expect(view.find(e => e?.id === 'a:first')!.enabled).toBe(false)
        expect(view.some(e => e?.id === 'a:palette-only')).toBe(false)
    })

    it('refuses a second command with the same id, and a removal only removes its own', () => {
        const remove = registerCommand(command('a:x'))
        expect(() => registerCommand(command('a:x'))).toThrow(/already registered/)
        remove()
        const again = command('a:x')
        registerCommand(again)
        remove()
        expect(registeredCommands.get('a:x')).toBe(again)
        registeredCommands.clear()
    })
})
