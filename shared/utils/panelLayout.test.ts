import {describe, expect, it} from "vitest";
import {DEFAULT_PANEL_LAYOUT, addPanelSeparator, addPanelSplit, isPanelViewId, movePanelSlot, normalizePanelLayout, panelAreaOf, panesOf, placeMissingViews, tidySlots} from "./panelLayout";

describe('tidySlots', () => {
    it('keeps a split only between views, and no separator at a pane\'s edge', () => {
        expect(tidySlots(['split', 'files', 'separator', 'split', 'separator', 'split', 'chats', 'separator', 'split'])).toEqual(['files', 'split', 'chats'])
        expect(tidySlots(['files', 'separator', 'chats', 'split', 'toc'])).toEqual(['files', 'separator', 'chats', 'split', 'toc'])
    })
})

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
            bottom: [],
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

    it('moves into and out of the bottom area', () => {
        const down = movePanelSlot(layout, {list: 'right', index: 3}, {list: 'bottom', index: 0})
        expect([down.right, down.bottom]).toEqual([['forelinks', 'backlinks', 'writersTools', 'chat'], ['toc']])
        expect(panelAreaOf(down, 'toc')).toBe('bottom')
        const back = movePanelSlot(down, {list: 'bottom', index: 0}, {list: 'left', index: 0})
        expect([back.left[0], back.bottom]).toEqual(['toc', []])
    })
})

describe('the bottom area', () => {
    it('is empty in layouts saved before it, and keeps its views and splits', () => {
        expect(normalizePanelLayout({left: ['files', 'chats', 'search'], right: ['forelinks'], hidden: []}).bottom).toEqual([])
        const layout = normalizePanelLayout({right: ['forelinks', 'backlinks', 'writersTools'], bottom: ['toc', 'split', 'chat', 'split']})
        expect([layout.right, layout.bottom]).toEqual([['forelinks', 'backlinks', 'writersTools'], ['toc', 'split', 'chat']])
    })
})

describe('addPanelSeparator', () => {
    it('inserts one, but never at an end or beside another', () => {
        expect(addPanelSeparator(DEFAULT_PANEL_LAYOUT, 'left', 1).left).toEqual(['files', 'separator', 'chats', 'search'])
        expect(addPanelSeparator(DEFAULT_PANEL_LAYOUT, 'left', 3).left).toEqual(['files', 'chats', 'search'])
    })
})

describe('splits', () => {
    it('are kept on a side, never taken for a view id, and go when dropped on hidden', () => {
        const layout = normalizePanelLayout({left: ['files', 'split', 'chats', 'search'], hidden: ['split']})
        expect([layout.left, layout.hidden]).toEqual([['files', 'split', 'chats', 'search'], []])
        expect(isPanelViewId('split')).toBe(false)
        const dropped = movePanelSlot(layout, {list: 'left', index: 1}, {list: 'hidden', index: 0})
        expect([dropped.left, dropped.hidden]).toEqual([['files', 'chats', 'search'], []])
    })

    it('are inserted before a view, but never at an end or beside another', () => {
        expect(addPanelSplit(DEFAULT_PANEL_LAYOUT, 'left', 1).left).toEqual(['files', 'split', 'chats', 'search'])
        expect(addPanelSplit(DEFAULT_PANEL_LAYOUT, 'left', 0).left).toEqual(['files', 'chats', 'search'])
        expect(addPanelSplit({...DEFAULT_PANEL_LAYOUT, left: ['files', 'split', 'chats', 'search']}, 'left', 2).left).toEqual(['files', 'split', 'chats', 'search'])
    })
})

describe('panesOf', () => {
    const slot = (s: {slot: string}) => s.slot
    const isView = (s: {slot: string}) => s.slot !== 'search' && s.slot !== 'separator'
    const items = (...slots: string[]) => slots.map((s, index) => ({slot: s, index}))

    it('cuts at splits and records the splits around each pane', () => {
        const [first, second] = panesOf(items('files', 'separator', 'chats', 'split', 'toc'), slot, isView)
        expect(first).toEqual({slots: [{slot: 'files', index: 0}, {slot: 'separator', index: 1}, {slot: 'chats', index: 2}], splitAfter: {slot: 'split', index: 3}})
        expect(second).toEqual({slots: [{slot: 'toc', index: 4}], splitBefore: {slot: 'split', index: 3}})
    })

    it('folds a run without views into the pane before it, or after it at the start', () => {
        const middle = panesOf(items('files', 'split', 'search', 'split', 'chats'), slot, isView)
        expect(middle.map(p => p.slots.map(s => s.slot))).toEqual([['files', 'search'], ['chats']])
        // The pane boundary is the split before the next real pane.
        expect([middle[0]!.splitAfter?.index, middle[1]!.splitBefore?.index]).toEqual([3, 3])
        const leading = panesOf(items('search', 'split', 'files'), slot, isView)
        expect(leading).toEqual([{slots: [{slot: 'search', index: 0}, {slot: 'files', index: 2}]}])
        expect(panesOf(items('search'), slot, isView)).toEqual([{slots: [{slot: 'search', index: 0}]}])
    })
})
