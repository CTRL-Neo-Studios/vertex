import {describe, expect, it} from "vitest";
import {DEFAULT_PANEL_LAYOUT, addPanelSeparator, isPanelViewId, movePanelSlot, normalizePanelLayout, placeMissingViews} from "./panelLayout";

describe('normalizePanelLayout', () => {
    it('gives the stock arrangement for nothing stored', () => {
        expect(normalizePanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT)
    })

    it('keeps unknown ids in place, drops malformed ones, keeps a view where it first appears (hidden wins), and tidies separators', () => {
        expect(normalizePanelLayout({
            left: ['separator', 'chat', 'plugin:view', 'separator', 'separator', 'files', 'toc', 'separator'],
            right: ['files', 42, '', 'has space', '../up', 'separator', 'forelinks'],
            hidden: ['toc', 'toc', 'gone'],
        })).toEqual({
            // Missing built-in views go back to the end of their stock side.
            left: ['chat', 'plugin:view', 'separator', 'files', 'chats', 'search'],
            right: ['forelinks', 'backlinks', 'writersTools'],
            hidden: ['toc', 'gone'],
        })
    })

    it('never takes a slot keyword as a view id', () => {
        expect(isPanelViewId('separator')).toBe(false)
        expect(isPanelViewId('writersTools')).toBe(true)
    })
})

describe('placeMissingViews', () => {
    it('adds views the layout lacks at the end of their default list, in order, and leaves held ones alone', () => {
        const placed = placeMissingViews(DEFAULT_PANEL_LAYOUT, [
            {id: 'files', defaultArea: 'right'},
            {id: 'git', defaultArea: 'left'},
            {id: 'graph', defaultArea: 'hidden'},
            {id: 'log', defaultArea: 'left'},
        ])
        expect(placed).toEqual({...DEFAULT_PANEL_LAYOUT, left: ['files', 'chats', 'search', 'git', 'log'], hidden: ['graph']})
    })

    it('counts a hidden view as held', () => {
        const layout = {...DEFAULT_PANEL_LAYOUT, hidden: ['git']}
        expect(placeMissingViews(layout, [{id: 'git', defaultArea: 'left'}])).toBe(layout)
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
