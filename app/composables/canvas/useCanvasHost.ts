import {convertFileSrc} from "@tauri-apps/api/core";
import {dirname, join} from "@tauri-apps/api/path";
import {save} from "@tauri-apps/plugin-dialog";
import {readTextFile, writeFile} from "@tauri-apps/plugin-fs";
import {fileKind, type FileKind} from "@type32/jsoncanvas-editor/core";
import type {CanvasHost} from "@type32/jsoncanvas-editor/vue";
import type {ActiveSession} from "#shared/types/active/sessions";
import {fileNameFromPath, getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import {getInternalLinks} from "#shared/utils/index/rewriteLinks";
import WorkflowPickModal from "~/components/Modals/WorkflowPickModal.vue";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {draggedRows, fromFile, type OutsideItem} from "~/utils/outsideItems";

/**
 * What a `.canvas` tab's cards get from the workspace: files by their workspace-relative paths (as Obsidian writes
 * them), the vault picker, imports into the attachments folder, the link graph, tabs and the system browser.
 * `canvasPath` is the canvas's own full path (exports are offered next to it).
 */
export function useCanvasHost(session: ActiveSession, canvasPath: () => string | undefined): CanvasHost {
    const {t} = useI18n()
    const root = session.rootPath!
    const {getFileByPath, getFileByUuid, getFilteredFiles, resolveLink} = useActiveWorkspaceIndex(session)
    const {importItems, indexedMatch, ensureFolder, saveContent} = useActiveWorkspaceTools(session)
    const {openTab} = useActiveTabs(session)
    const $navi = useAppNavigator()
    const {openUrlInBrowser} = useAppOpener()
    const {effective} = useSettingsScope()
    const picker = useOverlay().create(WorkflowPickModal)

    const fileAt = (path: string) => getFileByPath(`${root}/${path}`)
    const open = (uuid: string) => $navi.toWorkspaceTab(session.uuid, openTab(uuid))

    /** The extensions of the workspace's files of `kinds`, for the picker (it filters by extension). */
    function extensionsOf(kinds: FileKind[]) {
        const exts = new Set(getFilteredFiles(f => !f.isFolder).map(f => getFileExtensionFromPath(f.fileName)))
        return [...exts].filter(ext => kinds.includes(fileKind(`file.${ext}`))).join(',')
    }

    return {
        resolveFile(path) {
            const file = fileAt(path)
            return file && !file.isFolder ? {exists: true, url: convertFileSrc(file.fullPath)} : {exists: false}
        },
        readText: path => readTextFile(`${root}/${path}`),
        async writeText(path, text) {
            const file = fileAt(path)
            if (!file) throw new Error(`${path} isn't in the workspace`)
            await saveContent(file.uuid, text)
        },
        async pickFile(options) {
            const kinds = options?.kinds
            const extensions = !kinds?.length || kinds.includes('other') ? '' : extensionsOf(kinds)
            const picked = await picker.open({sessionId: session.uuid, title: t('app.editor.ui.canvas.pickFile'), kind: 'file', multiple: false, extensions}).result
            return picked?.[0]
        },
        // Files from outside: the workspace's own as they are, the rest copied into the attachments folder.
        async importFiles(files) {
            const own: string[] = [], outside: OutsideItem[] = []
            for (const item of files.map(fromFile)) {
                const uuid = indexedMatch(item)
                if (uuid) own.push(uuid)
                else outside.push(item)
            }
            const copied = outside.length
                ? await importItems(outside, await ensureFolder(effective.value?.fileConfig.attachmentsFolder ?? 'Attachments'), {copy: true}) || []
                : []
            return [...own, ...copied].flatMap(uuid => getFileByUuid(uuid)?.relativePath ?? [])
        },
        // Rows dragged from Files; folders aren't cards.
        filesIn: data => draggedRows(data)?.filter(ref => !ref.endsWith('/')),
        async listLinks(path) {
            const links = getInternalLinks(await readTextFile(`${root}/${path}`))
            return links.flatMap(link => {
                const file = resolveLink(link.path)
                return file ? [{file: file.relativePath, subpath: link.subpath ? `#${link.subpath}` : undefined}] : []
            })
        },
        openFile(path) {
            const file = fileAt(path)
            if (file) void open(file.uuid)
        },
        openLink(target) {
            const file = resolveLink(target.split('#')[0]!.trim())
            if (file) void open(file.uuid)
        },
        openUrl: url => void openUrlInBrowser(url),
        async saveImage(png) {
            const canvas = canvasPath()
            const name = `${fileNameFromPath(canvas ?? 'Canvas.canvas', true)}.png`
            const target = await save({
                title: t('app.editor.ui.canvas.exportTitle'),
                defaultPath: canvas ? await join(await dirname(canvas), name) : name,
                filters: [{name: 'PNG', extensions: ['png']}],
            })
            if (target) await writeFile(target, new Uint8Array(await png.arrayBuffer()))
        },
    }
}
