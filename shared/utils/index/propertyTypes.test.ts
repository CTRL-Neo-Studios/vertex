import {describe, expect, it} from "vitest";
import {editorType, readTypes, storedType, withType, writeTypes} from "./propertyTypes";

describe('types.json', () => {
    it('writes what Obsidian wrote for the same picks', () => {
        // Obsidian 1.15.1, a vault without types.json: score → Number, items → Text, then score → Automatic.
        let types = withType({}, 'score', 'number')
        expect(writeTypes(types)).toBe('{\n  "types": {\n    "aliases": "aliases",\n    "cssclasses": "multitext",\n    "tags": "tags",\n    "score": "number"\n  }\n}')
        types = withType(types, 'items', 'text')
        types = withType(types, 'score', null)
        expect(writeTypes(types)).toBe('{\n  "types": {\n    "aliases": "aliases",\n    "cssclasses": "multitext",\n    "tags": "tags",\n    "items": "text"\n  }\n}')
        expect(readTypes(writeTypes(types))).toEqual(types)
    })

    it('reads anything else as no types', () => {
        for (const text of ['', 'nope', '[]', '{"types": []}', '{"types": "x"}']) expect(readTypes(text)).toEqual({})
        expect(readTypes('{"types": {"a": "text", "b": 3}}')).toEqual({a: 'text'})
    })

    it('names lists as Obsidian does and leaves its other widgets to inference', () => {
        expect(storedType('list')).toBe('multitext')
        expect(editorType('multitext')).toBe('list')
        expect(editorType('file')).toBeUndefined()
    })
})
