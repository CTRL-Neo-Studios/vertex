import {toText, type QueryGroup} from "@type32/obsidian-bases-parser";

/** Folded groups of one layout, by their value's text; they belong to the tab, never the file. */
export function useGroupFolds() {
    const folded = ref(new Set<string>())
    const key = (group: QueryGroup) => (group.key === null ? '' : toText(group.key))
    return {
        isFolded: (group: QueryGroup) => folded.value.has(key(group)),
        toggle(group: QueryGroup) {
            const next = new Set(folded.value)
            if (!next.delete(key(group))) next.add(key(group))
            folded.value = next
        },
    }
}
