import {toText, type Value} from "@type32/obsidian-bases-parser";

/**
 * A view's table as Obsidian copies it: a header row of the shown columns' labels (`file.name` alone when the view
 * has no `order`), then each row's values as text, Null as an empty cell.
 */
export function tableCells(order: string[] = ['file.name'], label: (id: string) => string, rows: { property(id: string): Value }[]): string[][] {
    return [
        order.map(label),
        ...rows.map(row => order.map((id) => {
            const value = row.property(id)
            return value.type === 'Null' ? '' : toText(value)
        })),
    ]
}

/** Obsidian's text/plain copy: tab-separated, `\n` between rows, no trailing newline. */
export const toTsv = (cells: string[][]) => cells.map(row => row.join('\t')).join('\n')

/** RFC 4180: fields with `,`, `"` or a line break are quoted, inner quotes doubled; `\n` between rows. */
export const toCsv = (cells: string[][]) => cells
    .map(row => row.map(cell => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)).join(','))
    .join('\n')
