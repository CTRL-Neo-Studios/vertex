import {describe, expect, it} from "vitest";
import type {Value} from "@type32/obsidian-bases-parser";
import {tableCells, toCsv, toTsv} from "./basesTable";

const row = (values: Record<string, Value>) => ({property: (id: string) => values[id] ?? {type: 'Null'} as Value})
const labels: Record<string, string> = {'file.name': 'file name', status: 'status', n: 'n'}

describe('basesTable', () => {
    const cells = tableCells(['file.name', 'status', 'n'], id => labels[id]!, [
        row({'file.name': {type: 'String', value: 'A'}, status: {type: 'String', value: 'todo'}, n: {type: 'Number', value: 1}}),
        row({'file.name': {type: 'String', value: 'B'}}),
    ])

    it('heads the table with the labels and leaves Null empty', () => {
        expect(cells).toEqual([['file name', 'status', 'n'], ['A', 'todo', '1'], ['B', '', '']])
    })

    it('shows file.name alone without an order', () => {
        expect(tableCells(undefined, id => labels[id]!, [])).toEqual([['file name']])
    })

    it('writes TSV as Obsidian copies it', () => {
        expect(toTsv(cells)).toBe('file name\tstatus\tn\nA\ttodo\t1\nB\t\t')
    })

    it('quotes CSV fields with commas, quotes and line breaks', () => {
        expect(toCsv([['a', 'b,c'], ['say "hi"', 'x\ny'], ['plain', '']])).toBe('a,"b,c"\n"say ""hi""","x\ny"\nplain,')
    })
})
