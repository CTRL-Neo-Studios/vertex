import {describe, expect, it} from "vitest";
import {propertySuggestions} from "./propertySuggestions";

// The probe notes Obsidian 1.15.1 was observed on (zz-e3), with the tags each body has.
const notes = [
    {properties: {status: 'todo', author: 'Ann', topics: ['alpha', 'beta'], tags: ['draft']}, tags: ['#inline']},
    {properties: {status: 'doing', author: 'Bob', topics: ['beta', 'gamma'], tags: ['draft', 'work/x']}, tags: ['#inline']},
    {properties: {status: 'todo', zeta: 1, tags: ['#idea']}, tags: ['#inline']},
    {properties: {status: 'X', topics: ['alpha'], tags: 'lab, lab/parity'}, tags: []},
]

describe('propertySuggestions', () => {
    const {keys, values, tags} = propertySuggestions(notes)

    it('offers the built-ins first, then every property as first seen', () => {
        expect(keys).toEqual(['aliases', 'cssclasses', 'tags', 'status', 'author', 'topics', 'zeta'])
    })

    it('offers a key\'s distinct text values alphabetically, list items included', () => {
        expect(values.get('status')).toEqual(['doing', 'todo', 'X'])
        expect(values.get('topics')).toEqual(['alpha', 'beta', 'gamma'])
        expect(values.has('zeta')).toBe(false)
    })

    it('offers every tag without #, from frontmatter (lists or text) and bodies', () => {
        expect(tags).toEqual(['draft', 'idea', 'inline', 'lab', 'lab/parity', 'work/x'])
    })
})
