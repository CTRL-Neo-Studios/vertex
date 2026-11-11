import {diffLines} from "diff";

export interface DiffLine {
    kind: 'same' | 'add' | 'del'
    text: string
    /** 1-based line number in the old text (`same`, `del`). */
    old?: number
    /** 1-based line number in the new text (`same`, `add`). */
    new?: number
}

/** Unchanged lines folded away; `lines` are what it hides. */
export interface DiffFold {
    kind: 'fold'
    lines: DiffLine[]
}

export type DiffItem = DiffLine | DiffFold

/** A side-by-side row: the old line on the left, the new on the right (either may be missing), or a fold across both. */
export type SplitRow = { fold: DiffFold } | { left?: DiffLine, right?: DiffLine }

const linesOf = (value: string) => {
    const lines = value.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return lines.map(line => line.replace(/\r$/, ''))
}

/**
 * `before` → `after` line by line, numbered on each side. Unchanged runs keep `context` lines next to each change
 * and fold the rest (the file's start and end have a change on one side only); a fold always hides 2 lines or more.
 * A missing newline at the end counts as there, so adding one doesn't show the last line as changed.
 */
export function lineDiff(before: string, after: string, context = 3): DiffItem[] {
    const ended = (text: string) => (text && !text.endsWith('\n') ? text + '\n' : text)
    const lines: DiffLine[] = []
    let oldNo = 1
    let newNo = 1
    for (const part of diffLines(ended(before), ended(after))) {
        for (const text of linesOf(part.value)) {
            if (part.added) lines.push({kind: 'add', text, new: newNo++})
            else if (part.removed) lines.push({kind: 'del', text, old: oldNo++})
            else lines.push({kind: 'same', text, old: oldNo++, new: newNo++})
        }
    }

    const items: DiffItem[] = []
    for (let start = 0; start < lines.length;) {
        if (lines[start]!.kind !== 'same') {
            items.push(lines[start++]!)
            continue
        }
        let end = start
        while (end < lines.length && lines[end]!.kind === 'same') end++
        const head = start === 0 ? 0 : context
        const tail = end === lines.length ? 0 : context
        if (end - start - head - tail >= 2) {
            items.push(...lines.slice(start, start + head), {kind: 'fold', lines: lines.slice(start + head, end - tail)}, ...lines.slice(end - tail, end))
        } else {
            items.push(...lines.slice(start, end))
        }
        start = end
    }
    return items
}

/** Side-by-side rows: each removed run beside the added run after it, line by line. */
export function splitRows(items: DiffItem[]): SplitRow[] {
    const rows: SplitRow[] = []
    for (let i = 0; i < items.length;) {
        const item = items[i]!
        if (item.kind === 'fold') {
            rows.push({fold: item})
            i++
        } else if (item.kind === 'same') {
            rows.push({left: item, right: item})
            i++
        } else {
            const removed: DiffLine[] = []
            const added: DiffLine[] = []
            while (items[i]?.kind === 'del') removed.push(items[i++] as DiffLine)
            while (items[i]?.kind === 'add') added.push(items[i++] as DiffLine)
            for (let k = 0; k < Math.max(removed.length, added.length); k++) rows.push({left: removed[k], right: added[k]})
        }
    }
    return rows
}

/** Lines added and removed in a diff (folds hold only unchanged lines). */
export function diffCounts(items: DiffItem[]) {
    let added = 0
    let removed = 0
    for (const item of items) {
        if (item.kind === 'add') added++
        else if (item.kind === 'del') removed++
    }
    return {added, removed}
}

/** Whether a text looks binary (a NUL in its first 8000 characters, git's own test). */
export const isBinaryText = (text: string) => text.slice(0, 8000).includes('\0')
