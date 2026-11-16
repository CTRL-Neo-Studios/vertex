/** Heights Obsidian gives a table's rows (`rowHeight`), and its header, group headings and summary rows. */
export const ROW_HEIGHTS = {short: 30, medium: 60, tall: 120, extra: 240} as const
export type RowHeight = keyof typeof ROW_HEIGHTS
export const LINE_HEIGHT = 30

/** One line of the table body: a group heading, a group's summary row, or a row (`index` into the flat row list). */
export type GridItem<G> =
    | { kind: 'heading', group: G, groupIndex: number }
    | { kind: 'summary', group: G, groupIndex: number }
    | { kind: 'row', group: G, groupIndex: number, index: number }

/**
 * The body's lines, top to bottom: per group its heading (when grouped), its summary row (when the view has
 * summaries) and its rows, unless folded. Also each line's top offset, and the rows in order (what the keyboard walks).
 */
export function layoutItems<G extends { rows: unknown[] }>(groups: G[], options: {
    grouped: boolean, summaries: boolean, folded: (groupIndex: number) => boolean, rowHeight: number,
}) {
    const items: GridItem<G>[] = []
    const rows: G['rows'][number][] = []
    groups.forEach((group, groupIndex) => {
        if (options.grouped) items.push({kind: 'heading', group, groupIndex})
        if (options.grouped && options.folded(groupIndex)) return
        if (options.grouped && options.summaries) items.push({kind: 'summary', group, groupIndex})
        for (const row of group.rows) items.push({kind: 'row', group, groupIndex, index: rows.push(row) - 1})
    })
    const tops: number[] = []
    let height = 0
    for (const item of items) {
        tops.push(height)
        height += item.kind === 'row' ? options.rowHeight : LINE_HEIGHT
    }
    return {items, rows, tops, height}
}

/** Indices `[from, to)` of the lines showing between `top` and `bottom` (body pixels), plus `overscan` either side. */
export function visibleRange(tops: number[], height: number, top: number, bottom: number, overscan = 4) {
    const firstEnding = (y: number) => {
        let lo = 0, hi = tops.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if ((tops[mid + 1] ?? height) <= y) lo = mid + 1
            else hi = mid
        }
        return lo
    }
    return {from: Math.max(0, firstEnding(top) - overscan), to: Math.min(tops.length, firstEnding(bottom) + 1 + overscan)}
}

export interface Cell { row: number, column: number }

/** The rectangle between two cells, inclusive. */
export function selectionRect(anchor: Cell, focus: Cell) {
    return {
        top: Math.min(anchor.row, focus.row), bottom: Math.max(anchor.row, focus.row),
        left: Math.min(anchor.column, focus.column), right: Math.max(anchor.column, focus.column),
    }
}

/** Tab-separated lines (Obsidian's cell copy) into a grid of texts; a trailing newline adds no row. */
export const parseTsv = (text: string) => text.replace(/\r?\n$/, '').split(/\r?\n/).map(line => line.split('\t'))
