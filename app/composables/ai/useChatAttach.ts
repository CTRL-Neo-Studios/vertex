import {invoke} from "@tauri-apps/api/core";
import type {ActiveSession} from "#shared/types/active/sessions";
import {fileNameFromPath, getFileExtensionFromPath, isImage, isPlainTextFile} from "#shared/utils/fs/filenames";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {outsideItemsAt, type OutsideItem} from "~/utils/outsideItems";
import ImportToChatModal from "~/components/Modals/ImportToChatModal.vue";

/** What a drag from the Files tree carries besides its own state: the rows' workspace-relative paths, a folder's ending in `/`. */
export const FILES_DRAG = 'application/x-vertex-files'

/** Common provider limits on one image. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** A pasted screenshot's name, as Obsidian names one: `Pasted image 20261111143012.png`. */
export function pastedImageName(type: string, at = new Date()) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
    return `Pasted image ${stamp}.${type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1] || 'png'}`
}

/**
 * What chat can attach from a drop or a paste, as attachment refs (workspace-relative; a folder's ends in `/`): notes,
 * folders and images (ones the chat's model takes, up to 5 MB). Files from the workspace are attached as they are.
 * Files from outside (Finder, Explorer, a screenshot) are copied into the attachments folder first
 * (`fileConfig.attachmentsFolder`), after `ImportToChatModal` asks unless the workspace said always
 * (`fileConfig.importToChat`). What chat can't take is named in a toast and left alone (nothing copied).
 */
export function useChatAttach(session: ActiveSession | undefined, chatId: () => string) {
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const scope = useSettingsScope()
    const {getFileByUuid, getFileByPath} = useActiveWorkspaceIndex(session)
    const {importItems, indexedMatch, ensureFolder} = useActiveWorkspaceTools(session)
    const {chatTakesImages, chatProfile} = useChats(session)
    const importModal = useOverlay().create(ImportToChatModal)

    const refOf = (uuid: string | undefined) => {
        const file = getFileByUuid(uuid)
        return file && (file.isFolder ? `${file.relativePath}/` : file.relativePath)
    }

    /** The items chat can take, by name and size; the rest named in one toast per reason. */
    function takeable<T>(items: T[], name: (item: T) => string, isFolder: (item: T) => boolean, size: (item: T) => number) {
        const kept: T[] = [], unsupported: string[] = [], tooBig: string[] = []
        let noImages = false
        for (const item of items) {
            const ext = getFileExtensionFromPath(name(item))
            if (isFolder(item) || isPlainTextFile(ext)) kept.push(item)
            else if (!isImage(ext)) unsupported.push(fileNameFromPath(name(item)))
            else if (chatTakesImages(chatId()) === false) noImages = true
            else if (size(item) > MAX_IMAGE_BYTES) tooBig.push(fileNameFromPath(name(item)))
            else kept.push(item)
        }
        if (unsupported.length) $qt.warning(t('app.chat.attach.unsupported', {names: unsupported.join(', ')}))
        if (tooBig.length) $qt.warning(t('app.chat.attach.tooBig', {names: tooBig.join(', ')}))
        if (noImages) $qt.warning(t('app.chat.attach.noImages', {model: chatProfile(chatId())?.modelId ?? ''}))
        return kept
    }

    /** Workspace refs (from the tree, or the clipboard's workspace files) that chat can take. */
    function fromWorkspace(refs: string[]) {
        const sizeOf = (ref: string) => getFileByPath(`${session?.rootPath}/${ref}`)?.size ?? 0
        return takeable(refs, ref => ref.replace(/\/$/, ''), ref => ref.endsWith('/'), sizeOf)
    }

    /** Outside items: the workspace's own attach as they are; the rest are copied in (asking first), then attached. */
    async function fromOutside(items: OutsideItem[]): Promise<string[]> {
        const own: string[] = [], outside: OutsideItem[] = []
        for (const item of items) {
            const ref = refOf(indexedMatch(item))
            if (ref) own.push(ref)
            else outside.push(item)
        }
        const kept = takeable(outside, i => i.name, i => i.isFolder, i => i.size)
        const attached = fromWorkspace(own)
        if (!kept.length || !session?.rootPath) return attached
        const config = scope.effective.value?.fileConfig
        const folder = config?.attachmentsFolder ?? 'Attachments'
        if (config?.importToChat !== 'always') {
            const answer = await importModal.open({
                count: kept.length,
                folder: folder || fileNameFromPath(session.rootPath),
                canRemember: session.workspaceSession,
            }).result
            if (!answer?.add) return attached
            if (answer.remember) await scope.set({'fileConfig.importToChat': 'always'})
        }
        const ids = await importItems(kept, await ensureFolder(folder), {copy: true}) || []
        return [...attached, ...ids.flatMap(id => refOf(id) ?? [])]
    }

    /**
     * A paste of files: those on the system clipboard (copied in Files, Finder or Explorer) first, else `images`
     * (image data without a file, such as a screenshot: saved as a pasted image).
     */
    async function fromPaste(images: File[]): Promise<string[]> {
        const paths = await invoke<string[]>('clipboard_files_get')
        if (paths.length) {
            const inside = paths.flatMap(p => refOf(getFileByPath(p)?.uuid) ?? [])
            const outside = paths.filter(p => !getFileByPath(p))
            return [...fromWorkspace(inside), ...outside.length ? await fromOutside(await outsideItemsAt(outside)) : []]
        }
        return fromOutside(images.map(file => ({
            name: pastedImageName(file.type), isFolder: false, size: file.size, modified: Date.now(), children: () => [],
            read: async () => new Uint8Array(await file.arrayBuffer()),
        })))
    }

    return {fromWorkspace, fromOutside, fromPaste}
}
