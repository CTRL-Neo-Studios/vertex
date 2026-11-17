import type {OutsideFiles, SessionContext} from "#shared/plugin/api";
import {fileNameFromPath, getFileExtensionFromPath, isImage, isPlainTextFile} from "#shared/plugin/files";
import {chatContext} from "../plugin";
import {useChats} from "./chats";
import {useNotify} from "./notify";
import ChatImportModal from "../components/ImportModal.vue";

/** Common provider limits on one image. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * What chat can attach from a drop or a paste, as attachment refs (workspace-relative; a folder's ends in `/`): notes,
 * folders and images (ones the chat's model takes, up to 5 MB). Files from the workspace are attached as they are.
 * Files from outside (Finder, Explorer, a screenshot) are copied into the attachments folder first
 * (`session.files.outside(…).import`), after `ChatImportModal` asks unless the config's `importFiles` is `always`.
 * What chat can't take is named in a toast and left alone (nothing copied).
 */
export function useChatAttach(session: SessionContext, chatId: () => string) {
    const {t} = useI18n()
    const $qt = useNotify()
    const {chatTakesImages, chatProfile} = useChats(session)
    const importModal = useOverlay().create(ChatImportModal)

    const refOf = (uuid: string) => {
        const file = session.index.byUuid(uuid)
        return file && (file.isFolder ? `${file.relativePath}/` : file.relativePath)
    }

    /** The items chat can take, by name and size; the rest named in one toast per reason. */
    function takeable<T>(items: readonly T[], name: (item: T) => string, isFolder: (item: T) => boolean, size: (item: T) => number) {
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
        if (unsupported.length) $qt.warning(t('plugins.chat.attach.unsupported', {names: unsupported.join(', ')}))
        if (tooBig.length) $qt.warning(t('plugins.chat.attach.tooBig', {names: tooBig.join(', ')}))
        if (noImages) $qt.warning(t('plugins.chat.attach.noImages', {model: chatProfile(chatId())?.modelId ?? ''}))
        return kept
    }

    /** Workspace refs (rows dragged from Files) that chat can take. */
    function fromWorkspace(refs: string[]) {
        const sizeOf = (ref: string) => session.index.byPath(`${session.session.rootPath}/${ref}`)?.size ?? 0
        return takeable(refs, ref => ref.replace(/\/$/, ''), ref => ref.endsWith('/'), sizeOf)
    }

    /** Files from outside (`session.files.outside`): the workspace's own attach as they are; the rest are copied in (asking first), then attached. */
    async function fromOutside(outside: OutsideFiles): Promise<string[]> {
        const attached = fromWorkspace(outside.own.flatMap(uuid => refOf(uuid) ?? []))
        const kept = takeable(outside.items, i => i.name, i => i.isFolder, i => i.size)
        if (!kept.length) return attached
        if (chatContext().config.value.importFiles !== 'always') {
            const folder = outside.folder || fileNameFromPath(session.session.rootPath ?? '')
            const answer = await importModal.open({count: kept.length, folder, canRemember: session.session.workspaceSession}).result
            if (!answer?.add) return attached
            if (answer.remember) await chatContext().config.set({importFiles: 'always'}, 'workspace')
        }
        const ids = await outside.import(kept)
        return [...attached, ...ids.flatMap(id => refOf(id) ?? [])]
    }

    /**
     * A paste of files: those on the system clipboard (copied in Files, Finder or Explorer) first, else `images`
     * (image data without a file, such as a screenshot: saved as a pasted image).
     */
    async function fromPaste(images: File[]): Promise<string[]> {
        const clipboard = await session.files.outside('clipboard')
        return fromOutside(clipboard.own.length || clipboard.items.length ? clipboard : await session.files.outside(images))
    }

    return {fromWorkspace, fromOutside, fromPaste}
}
