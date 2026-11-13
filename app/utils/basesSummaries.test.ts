import {describe, expect, it} from "vitest";
import type {Value} from "@type32/obsidian-bases-parser";
import {fittingSummaries} from "./basesSummaries";

const NULL: Value = {type: 'Null'}
const num = (value: number): Value => ({type: 'Number', value})
const date = (ms: number): Value => ({type: 'Date', ms, time: false})
const bool = (value: boolean): Value => ({type: 'Boolean', value})
const text = (value: string): Value => ({type: 'String', value})

describe('fittingSummaries', () => {
    it('offers the number summaries for numbers, ignoring empty values', () => {
        expect(fittingSummaries([num(1), NULL, num(2)])).toEqual(['Average', 'Empty', 'Filled', 'Max', 'Median', 'Min', 'Range', 'Stddev', 'Sum', 'Unique'])
    })

    it('offers the date summaries for dates', () => {
        expect(fittingSummaries([date(0), date(1), NULL])).toEqual(['Earliest', 'Empty', 'Filled', 'Latest', 'Range', 'Unique'])
    })

    it('offers the checkbox summaries for booleans', () => {
        expect(fittingSummaries([bool(true), bool(false)])).toEqual(['Checked', 'Empty', 'Filled', 'Unchecked', 'Unique'])
    })

    it('offers only the generic summaries for text, mixed or all-empty values', () => {
        const generic = ['Empty', 'Filled', 'Unique']
        expect(fittingSummaries([text('a')])).toEqual(generic)
        expect(fittingSummaries([num(1), date(0)])).toEqual(generic)
        expect(fittingSummaries([NULL, NULL])).toEqual(generic)
        expect(fittingSummaries([])).toEqual(generic)
    })
})
