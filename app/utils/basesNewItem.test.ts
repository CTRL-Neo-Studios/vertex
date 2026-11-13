import {describe, expect, it} from "vitest";
import {toFilterGroup, type PropertyKind} from "@type32/obsidian-bases-parser";
import {newItemFrontmatter} from "./basesNewItem";

const kinds: Record<string, PropertyKind> = {status: 'text', n: 'number', due: 'date'}
const kindOf = (id: string) => kinds[id] ?? 'text'

describe('newItemFrontmatter', () => {
    it('writes what Obsidian wrote for its filters', () => {
        const filters = {and: ['status == "todo"', 'n > 1', 'file.hasTag("x")', 'due.isEmpty()']}
        expect(newItemFrontmatter([toFilterGroup(filters, kindOf)], kindOf)).toBe('---\nstatus: todo\ntags:\n  - x\nn:\n---\n')
    })

    it('writes no block without keys', () => {
        expect(newItemFrontmatter([toFilterGroup(undefined, kindOf), toFilterGroup('file.name == "a"', kindOf)], kindOf)).toBe('')
    })
})
