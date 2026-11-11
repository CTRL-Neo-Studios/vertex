import {describe, expect, it} from "vitest";
import {isBinaryText, lineDiff, splitRows, type DiffItem} from "./textDiff";

const lines = (n: number) => Array.from({length: n}, (_, i) => `line ${i + 1}`)
const text = (rows: string[]) => rows.join('\n') + '\n'
/** `+3` added, `-3` removed, ` 3` unchanged (old number), `~4` a fold of 4 lines. */
const shape = (items: DiffItem[]) => items.map(i =>
    i.kind === 'fold' ? `~${i.lines.length}` : i.kind === 'add' ? `+${i.new}` : i.kind === 'del' ? `-${i.old}` : ` ${i.old}`)

describe('lineDiff', () => {
    it('numbers each side and keeps context around a change, folding the rest', () => {
        const before = lines(20)
        const after = [...before]
        after[9] = 'changed'
        expect(shape(lineDiff(text(before), text(after)))).toEqual(['~6', ' 7', ' 8', ' 9', '-10', '+10', ' 11', ' 12', ' 13', '~7'])
    })

    it('folds nothing that saves fewer than two lines, and everything when nothing changed', () => {
        // 5 unchanged lines before an addition at the end: 3 kept, 2 folded.
        expect(shape(lineDiff(text(lines(5)), text([...lines(5), 'new'])))).toEqual(['~2', ' 3', ' 4', ' 5', '+6'])
        expect(shape(lineDiff(text(lines(4)), text([...lines(4), 'new'])))).toEqual([' 1', ' 2', ' 3', ' 4', '+5'])
        expect(shape(lineDiff(text(lines(5)), text(lines(5))))).toEqual(['~5'])
    })

    it('reads a new or deleted file as all added or all removed, without line-ending noise', () => {
        expect(shape(lineDiff('', 'a\r\nb\r\n'))).toEqual(['+1', '+2'])
        expect(lineDiff('', 'a\r\n')[0]).toMatchObject({text: 'a'})
        expect(shape(lineDiff('a\nb\n', ''))).toEqual(['-1', '-2'])
    })

    it('reads a text without a final newline like one with it', () => {
        expect(shape(lineDiff('a\nb', 'a\nb\nc\n'))).toEqual([' 1', ' 2', '+3'])
    })
})

describe('splitRows', () => {
    it('puts a removed run beside the added run after it, padding the shorter side', () => {
        const rows = splitRows(lineDiff('a\nb\nc\n', 'a\nB\nB2\nB3\nc\n'))
        expect(rows.map(r => 'fold' in r ? 'fold' : `${r.left?.text ?? '·'}|${r.right?.text ?? '·'}`))
            .toEqual(['a|a', 'b|B', '·|B2', '·|B3', 'c|c'])
    })

    it('keeps folds as rows of their own', () => {
        const rows = splitRows(lineDiff(text(lines(12)), text([...lines(12), 'end'])))
        expect('fold' in rows[0]! && rows[0].fold.lines.length).toBe(9)
    })
})

it('tells binary text by a NUL near the start', () => {
    expect(isBinaryText('PNG\0\0data')).toBe(true)
    expect(isBinaryText('# A note\n')).toBe(false)
})
