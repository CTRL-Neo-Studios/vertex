import {readTextFile} from "@tauri-apps/plugin-fs";
import {readYaml, writeYaml} from "@type32/obsidian-bases-parser";
import type {ActiveSession} from "#shared/types/active/sessions";
import {setFrontmatterProperty, type YamlTools} from "#shared/workflows/vault";
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
 * (⌘Z in the table, or Files' Undo). Notes keep everything but the changed keys. The frontmatter is read and written as
 * Obsidian does (YAML 1.2 core schema): the editor's YAML 1.1 reader would turn `due: 2026-02-03` into a Date written
 * back as `2026-02-03T00:00:00.000Z`, and quote a key like `n`.
 */
export function useNoteProperties(session: ActiveSession) {
    const $index = useActiveWorkspaceIndex(session)
    const tools = useActiveWorkspaceTools(session)
    const yaml: YamlTools = {
        frontmatterRange,
        parseYaml(text) {
            try {
                return {data: readYaml(text) ?? {}}
            } catch (error) {
                return {error}
            }
        },
        stringifyYaml: data => ({yaml: writeYaml(data).trimEnd()}),
    }
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
