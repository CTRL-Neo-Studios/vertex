import {describe, expect, it} from "vitest";
import {DEFAULT_PANEL_LAYOUT, addPanelSeparator, movePanelSlot, normalizePanelLayout} from "./panelLayout";

describe('normalizePanelLayout', () => {
    it('gives today\'s arrangement for nothing stored', () => {
        expect(normalizePanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT)
    })

    it('drops unknown ids, keeps a view where it first appears (hidden wins), and tidies separators', () => {
        expect(normalizePanelLayout({
            left: ['separator', 'chat', 'nope', 'separator', 'separator', 'files', 'toc', 'separator'],
            right: ['files', 'forelinks'],
            hidden: ['toc', 'toc', 'bogus'],
        })).toEqual({
            // Missing views go back to the end of their default side.
            left: ['chat', 'separator', 'files', 'chats', 'search'],
            right: ['forelinks', 'backlinks', 'writersTools'],
            hidden: ['toc'],
        })
    })
})

describe('movePanelSlot', () => {
    const layout = normalizePanelLayout({left: ['files', 'separator', 'chats', 'search'], right: ['forelinks', 'backlinks', 'writersTools', 'toc', 'chat']})

    it('moves within a side, counting the destination before the slot leaves', () => {
        expect(movePanelSlot(layout, {list: 'left', index: 0}, {list: 'left', index: 4}).left).toEqual(['chats', 'search', 'files'])
        expect(movePanelSlot(layout, {list: 'left', index: 3}, {list: 'left', index: 0}).left).toEqual(['search', 'files', 'separator', 'chats'])
    })

    it('moves across sides and to hidden; a separator dropped on hidden goes', () => {
        const moved = movePanelSlot(layout, {list: 'right', index: 4}, {list: 'left', index: 1})
        expect([moved.left, moved.right]).toEqual([['files', 'chat', 'separator', 'chats', 'search'], ['forelinks', 'backlinks', 'writersTools', 'toc']])
        expect(movePanelSlot(layout, {list: 'left', index: 2}, {list: 'hidden', index: 0}).hidden).toEqual(['chats'])
        const noSeparator = movePanelSlot(layout, {list: 'left', index: 1}, {list: 'hidden', index: 0})
        expect([noSeparator.left, noSeparator.hidden]).toEqual([['files', 'chats', 'search'], []])
    })

    it('shows a hidden view where it\'s dropped', () => {
        const hidden = {...layout, right: layout.right.filter(v => v !== 'toc'), hidden: ['toc' as const]}
        expect(movePanelSlot(hidden, {list: 'hidden', index: 0}, {list: 'right', index: 0}).right[0]).toBe('toc')
    })
})

describe('addPanelSeparator', () => {
    it('inserts one, but never at an end or beside another', () => {
        expect(addPanelSeparator(DEFAULT_PANEL_LAYOUT, 'left', 1).left).toEqual(['files', 'separator', 'chats', 'search'])
        expect(addPanelSeparator(DEFAULT_PANEL_LAYOUT, 'left', 3).left).toEqual(['files', 'chats', 'search'])
    })
})
