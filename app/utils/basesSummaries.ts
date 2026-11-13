import {toDisplay, toText, type Value} from "@type32/obsidian-bases-parser";

const ANY = ['Empty', 'Filled', 'Unique']
const BY_TYPE: Partial<Record<Value['type'], string[]>> = {
    Number: ['Average', 'Max', 'Median', 'Min', 'Range', 'Stddev', 'Sum'],
    Date: ['Earliest', 'Latest', 'Range'],
    Boolean: ['Checked', 'Unchecked'],
}

/** Every built-in summary, by its YAML name. */
export const BUILT_IN_SUMMARIES: readonly string[] = [...new Set([...ANY, ...Object.values(BY_TYPE).flat()])]

/**
 * The built-in summaries Obsidian offers for a column's values, alphabetical: the typed ones when every non-empty
 * value is a Number, Date or Boolean, plus Empty, Filled and Unique for any column (and alone for an all-empty one).
 */
export function fittingSummaries(values: Value[]): string[] {
    const filled = values.filter(v => v.type !== 'Null')
    const type = filled[0]?.type
    const typed = type && filled.every(v => v.type === type) ? BY_TYPE[type] ?? [] : []
    return [...ANY, ...typed].sort()
}

/** A summary's value as a cell shows it: dates as their text, nothing for Null. */
export function summaryText(value: Value): string {
    if (value.type === 'Null') return ''
    return value.type === 'Date' ? toText(value) : toDisplay(value)
}
