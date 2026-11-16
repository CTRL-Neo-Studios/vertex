import {dirname, join} from "@tauri-apps/api/path";
import {readTextFile, writeFile} from "@tauri-apps/plugin-fs";
import {openExternal} from "~/plugin/ui";
import {fileKind, type FileKind} from "@type32/jsoncanvas-editor/core";
import type {CanvasHost} from "@type32/jsoncanvas-editor/vue";
import type {SessionContext} from "#shared/plugin/api";
import {getInternalLinks} from "#shared/plugin/links";
import {canvasContext} from "../plugin";

/**
 * What a `.canvas` tab's cards get from the workspace: files by their workspace-relative paths (as Obsidian writes
 * them), the vault picker, imports into the attachments folder, the link graph, tabs and the system browser.
 * `canvasPath` is the canvas's own full path (exports are offered next to it).
 */
export function useCanvasHost(session: SessionContext, canvasPath: () => string | undefined): CanvasHost {
    const {t} = useI18n()
    const root = session.session.rootPath!
    const {index, files, tabs} = session

    const fileAt = (path: string) => index.byPath(`${root}/${path}`)

    /** The extensions of the workspace's files of `kinds`, for the picker (it filters by extension). */
    function extensionsOf(kinds: FileKind[]) {
        const exts = new Set(index.files().filter(f => !f.isFolder).map(f => f.fileExt))
        return [...exts].filter(ext => kinds.includes(fileKind(`file.${ext}`))).join(',')
    }

    return {
        resolveFile(path) {
            const file = fileAt(path)
            return file && !file.isFolder ? {exists: true, url: files.assetUrl(file.fullPath)} : {exists: false}
        },
        readText: path => readTextFile(`${root}/${path}`),
        async writeText(path, text) {
            const file = fileAt(path)
            if (!file) throw new Error(`${path} isn't in the workspace`)
            await files.write(file.uuid, text)
        },
        async pickFile(options) {
            const kinds = options?.kinds
            const extensions = !kinds?.length || kinds.includes('other') ? '' : extensionsOf(kinds)
            return (await files.pick({title: t('plugins.canvas.pickFile'), kind: 'file', multiple: false, extensions}))?.[0]
        },
        // Files from outside: the workspace's own as they are, the rest copied into the attachments folder.
        importFiles: async dropped => (await files.importAttachments(dropped)).flatMap(uuid => index.byUuid(uuid)?.relativePath ?? []),
        // Rows dragged from Files; folders aren't cards.
        filesIn: data => files.drag.rows(data)?.filter(ref => !ref.endsWith('/')),
        async listLinks(path) {
            const links = getInternalLinks(await readTextFile(`${root}/${path}`))
            return links.flatMap(link => {
                const file = index.resolveLink(link.path)
                return file ? [{file: file.relativePath, subpath: link.subpath ? `#${link.subpath}` : undefined}] : []
            })
        },
        openFile(path) {
            const file = fileAt(path)
            if (file) void tabs.open(file.uuid)
        },
        openLink(target) {
            const file = index.resolveLink(target.split('#')[0]!.trim())
            if (file) void tabs.open(file.uuid)
        },
        openUrl: url => void openExternal(url),
        async saveImage(png) {
            const canvas = canvasPath()
            const base = canvas?.slice(canvas.lastIndexOf('/') + 1).replace(/\.canvas$/, '') || 'Canvas'
            const name = `${base}.png`
            const target = await canvasContext().dialogs.save({
                title: t('plugins.canvas.exportTitle'),
                defaultPath: canvas ? await join(await dirname(canvas), name) : name,
                filters: [{name: 'PNG', extensions: ['png']}],
            })
            if (target) await writeFile(target, new Uint8Array(await png.arrayBuffer()))
        },
    }
}
