import {readTextFile} from "@tauri-apps/plugin-fs";
import type {SessionContext} from "#shared/plugin/api";
import {obsidianYaml, setFrontmatterProperty} from "#shared/plugin/frontmatter";

/** One property change: the note (workspace-relative path), the frontmatter key, the new value (null empties it). */
export interface PropertyEdit {
    path: string
    key: string
    value: unknown
}

/**
 * Writes note properties from a base (cell edits, paste, clear), as one undo step per call in the workspace's history
 * (⌘Z in the table, or Files' Undo). Notes keep everything but the changed keys, read and written as Obsidian does
 * (`obsidianYaml`).
 */
export function useNoteProperties({session, index, files}: SessionContext) {
    const yaml = obsidianYaml(frontmatterRange)
    const {t} = useI18n()

    async function setProperties(edits: PropertyEdit[]) {
        const byPath = Map.groupBy(edits, e => e.path)
        const notes: { uuid: string, text: string }[] = []
        for (const [path, changes] of byPath) {
            const node = index.byPath(`${session.rootPath}/${path}`)
            if (!node) continue
            let text = await readTextFile(node.fullPath)
            for (const {key, value} of changes) text = setFrontmatterProperty(text, key, value, yaml)
            notes.push({uuid: node.uuid, text})
        }
        const keys = [...new Set(edits.map(e => e.key))]
        await files.edit(notes, t('plugins.bases.editStep', {name: keys.join(', ')}, keys.length))
    }

    return {setProperties, undo: files.undo, redo: files.redo}
}
