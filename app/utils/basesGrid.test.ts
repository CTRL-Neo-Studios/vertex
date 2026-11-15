import {describe, expect, it} from 'vitest'
import {layoutItems, parseTsv, selectionRect, visibleRange} from './basesGrid'

const groups = [{key: 'a', rows: ['a1', 'a2']}, {key: 'b', rows: ['b1']}]

describe('layoutItems', () => {
    it('lays out headings, summary rows and rows; a folded group keeps only its heading', () => {
        const {items, rows, tops, height} = layoutItems(groups, {grouped: true, summaries: true, folded: i => i === 1, rowHeight: 60})
        expect(items.map(i => i.kind)).toEqual(['heading', 'summary', 'row', 'row', 'heading'])
        expect(rows).toEqual(['a1', 'a2'])
        expect(tops).toEqual([0, 30, 60, 120, 180])
        expect(height).toBe(210)
    })

    it('has only rows when not grouped', () => {
        const {items, rows} = layoutItems([{rows: ['x', 'y']}], {grouped: false, summaries: true, folded: () => true, rowHeight: 30})
        expect(items.map(i => i.kind)).toEqual(['row', 'row'])
        expect(rows).toEqual(['x', 'y'])
    })
})

describe('visibleRange', () => {
    const tops = [0, 30, 60, 90, 120]
    it('covers the lines between top and bottom, with overscan', () => {
        expect(visibleRange(tops, 150, 35, 70, 0)).toEqual({from: 1, to: 3})
        expect(visibleRange(tops, 150, 35, 70, 1)).toEqual({from: 0, to: 4})
        expect(visibleRange(tops, 150, 0, 1000, 2)).toEqual({from: 0, to: 5})
    })
})

it('selectionRect spans both corners', () => {
    expect(selectionRect({row: 3, column: 0}, {row: 1, column: 2})).toEqual({top: 1, bottom: 3, left: 0, right: 2})
})

it('parseTsv reads tab-separated lines', () => {
    expect(parseTsv('a\tb\nc\td\n')).toEqual([['a', 'b'], ['c', 'd']])
})
