import type {Extension} from "@codemirror/state";
import {dropCursor, EditorView} from "@codemirror/view";
import {invoke} from "@tauri-apps/api/core";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {fileNameFromPath, isImage} from "#shared/utils/fs/filenames";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {FILES_DRAG, outsideItems, outsideItemsAt, pastedImage, type OutsideItem} from "~/utils/outsideItems";

/**
 * Files into a note, as Obsidian does: links where they're dropped or pasted, `![[…]]` for an image (an embed),
 * `[[…]]` for anything else, one per line.
 * - Rows dragged from Files are linked as they are (folders left out).
 * - Files dropped from Finder or Explorer, or pasted (the system clipboard's files first, else image data such as a
 *   screenshot, saved as a pasted image), are copied into the attachments folder first
 *   (`fileConfig.attachmentsFolder`, created when first needed); ones the workspace already has are linked as they
 *   are. No dialog: putting a file in a note is the intent.
 * - Without a workspace there's nowhere to put them: OS files are refused ("not allowed"), as CodeMirror would
 *   otherwise put their bytes in as text.
 * Plain text pastes and the editor's own drags aren't touched. A drop cursor shows where a drop goes.
 */
export function useEditorFileDrops(session: ActiveSession | undefined): Extension {
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const {effective} = useSettingsScope()
    const {getFileByUuid, getFileByPath, resolveLink} = useActiveWorkspaceIndex(session)
    const {importItems, indexedMatch, ensureFolder} = useActiveWorkspaceTools(session)
    const workspace = !!session?.workspaceSession && !!session.rootPath

    /**
     * A link that finds `file`. A note: its name without `.md` when that's unique, else its path without it. Anything
     * else: its path, with the extension. The editor finds an embed by its full path or by a name without extension
     * (`![[cat]]`, which Obsidian wouldn't), so the path is what both read.
     */
    function linkTo(file: ActiveWorkspaceFileIndex) {
        if (file.fileExt !== 'md') return `${isImage(file.fileExt) ? '!' : ''}[[${file.relativePath}]]`
        const name = fileNameFromPath(file.fileName, true)
        return `[[${resolveLink(name)?.uuid === file.uuid ? name : file.relativePath.replace(/\.md$/, '')}]]`
    }
    const linksFor = (uuids: (string | undefined)[]) => uuids.flatMap(id => {
        const file = getFileByUuid(id)
        return file && !file.isFolder ? [linkTo(file)] : []
    }).join('\n')

    /** Inserts `text` at `at` (a drop), or over the selection (a paste), and leaves the cursor after it. */
    function insert(view: EditorView, text: string, at?: number) {
        if (!text) return
        const {from, to} = view.state.selection.main
        // The document may have changed while files were copied in.
        const start = at === undefined ? from : Math.min(at, view.state.doc.length)
        view.dispatch({
            changes: {from: start, to: at === undefined ? to : start, insert: text},
            selection: {anchor: start + text.length},
            scrollIntoView: true,
            userEvent: 'input.paste',
        })
        view.focus()
    }

    /** Outside items as workspace uuids: the workspace's own as they are, the rest copied into the attachments folder. */
    async function bringIn(items: OutsideItem[]) {
        const own: string[] = [], outside: OutsideItem[] = []
        for (const item of items) {
            const uuid = indexedMatch(item)
            if (uuid) own.push(uuid)
            else outside.push(item)
        }
        if (!outside.length) return own
        const folder = await ensureFolder(effective.value?.fileConfig.attachmentsFolder ?? 'Attachments')
        return [...own, ...await importItems(outside, folder, {copy: true}) || []]
    }

    async function fromPaste(images: File[]) {
        const paths = await invoke<string[]>('clipboard_files_get')
        if (!paths.length) return bringIn(images.map(file => pastedImage(file)))
        const outside = paths.filter(p => !getFileByPath(p))
        return [...paths.flatMap(p => getFileByPath(p)?.uuid ?? []), ...outside.length ? await bringIn(await outsideItemsAt(outside)) : []]
    }

    async function run(task: () => Promise<void>) {
        try {
            await task()
        } catch (error) {
            $qt.error(t('app.editor.ui.filetree.importFailed'), String(error))
        }
    }

    const carriesFiles = (transfer: DataTransfer | null) => !!transfer?.types.some(type => type === FILES_DRAG || type === 'Files')

    return [
        dropCursor(),
        EditorView.domEventHandlers({
            dragover(event) {
                if (!carriesFiles(event.dataTransfer)) return false
                event.preventDefault()
                event.dataTransfer!.dropEffect = workspace ? 'copy' : 'none'
                // Not handled: the drop cursor follows the pointer.
                return false
            },
            drop(event, view) {
                const transfer = event.dataTransfer
                if (!transfer || !carriesFiles(transfer)) return false
                event.preventDefault()
                if (!workspace) return true
                const at = view.posAtCoords({x: event.clientX, y: event.clientY}) ?? view.state.selection.main.head
                const rows = transfer.getData(FILES_DRAG)
                if (rows) {
                    insert(view, linksFor((JSON.parse(rows) as string[]).map(ref => getFileByPath(`${session!.rootPath}/${ref}`)?.uuid)), at)
                    return true
                }
                // Taken while the event lasts.
                const pending = outsideItems(transfer)
                void run(async () => insert(view, linksFor(await bringIn(await pending)), at))
                return true
            },
            paste(event, view) {
                const data = event.clipboardData
                if (!workspace || !data || (!data.files.length && !data.types.includes('Files') && !data.types.includes('text/uri-list'))) return false
                event.preventDefault()
                const images = [...data.files].filter(file => file.type.startsWith('image/')), text = data.getData('text/plain')
                // No files after all: the text goes in as it would have.
                void run(async () => insert(view, linksFor(await fromPaste(images)) || text))
                return true
            },
        }),
    ]
}
