import {readTextFile} from "@tauri-apps/plugin-fs";
import type {ActiveSession} from "#shared/types/active/sessions";
import {obsidianYaml, setFrontmatterProperty} from "#shared/utils/vault";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";

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
export function useNoteProperties(session: ActiveSession) {
    const $index = useActiveWorkspaceIndex(session)
    const tools = useActiveWorkspaceTools(session)
    const yaml = obsidianYaml(frontmatterRange)
    const {t} = useI18n()

    async function setProperties(edits: PropertyEdit[]) {
        const byPath = Map.groupBy(edits, e => e.path)
        const notes: { uuid: string, text: string }[] = []
        for (const [path, changes] of byPath) {
            const node = $index.getFileByPath(`${session.rootPath}/${path}`)
            if (!node) continue
            let text = await readTextFile(node.fullPath)
            for (const {key, value} of changes) text = setFrontmatterProperty(text, key, value, yaml)
            notes.push({uuid: node.uuid, text})
        }
        const keys = [...new Set(edits.map(e => e.key))]
        await tools.editNotes(notes, t('app.editor.ui.bases.editStep', {name: keys.join(', ')}, keys.length))
    }

    return {setProperties, undo: tools.undo, redo: tools.redo}
}
