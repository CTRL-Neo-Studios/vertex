import {writeText} from "@tauri-apps/plugin-clipboard-manager"
import {isTauri} from "@tauri-apps/api/core"
import type {ActiveSession} from "#shared/types/active/sessions";
import type {PluginMenuItem, SessionContext} from "#shared/plugin/api";
import {isPropertiesFile, parentPathOf, PROPERTIES_FILE_NAMES} from "#shared/utils/index/parse";
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import DeleteFilesModal from "~/components/Modals/DeleteFilesModal.vue";
import RenameFileModal from "~/components/Modals/RenameFileModal.vue";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {fileMenuItems, fileTypes} from "~/utils/contributions";
import {dragImage, dragImagePng} from "~/utils/dragImage";
import {FILES_DRAG, dragOut, outsideItems, outsideItemsAt, type OutsideItem} from "~/utils/outsideItems";
import {vertexInvoke} from "~/utils/vertexInvoke";

type Added = ((uuids: string[]) => void) | undefined

/**
 * What a file browser runs on the workspace's files (`SessionContext.files`): the file menu, the system clipboard,
 * duplicate, delete, drops of OS files and the start of a drag of rows. Folders are workspace-relative (`''` is the
 * top level); failures are toasted here.
 */
export function useFileActions(session: ActiveSession) {
    const {t} = useNuxtApp().$i18n
    const $ovl = useOverlay()
    const $navi = useAppNavigator()
    const $opener = useAppOpener()
    const $qt = useQuickToasts()
    const {openTab, openTabs} = useActiveTabs(session)
    const {getFileByUuid, getFileByPath, getPropertiesFile} = useActiveWorkspaceIndex(session)
    const {createFile, importItems, deleteFiles, deletedFiles, undo, redo, undoLabel, redoLabel} = useActiveWorkspaceTools(session)
    const newFileModal = $ovl.create(NewFileModal)
    const deleteFilesModal = $ovl.create(DeleteFilesModal)
    const renameFileModal = $ovl.create(RenameFileModal)

    const absOf = (folder: string) => (folder ? `${session.rootPath}/${folder}` : session.rootPath!)
    const folderOf = (uuid: string) => {
        const node = getFileByUuid(uuid)
        return !node ? '' : node.isFolder ? node.relativePath : parentPathOf(node.relativePath)
    }

    /** The given rows minus those inside another of them (they go with their folder). */
    function topOf(ids: Iterable<string>) {
        const nodes = [...ids].map(id => getFileByUuid(id)).filter(n => !!n)
        return nodes.filter(n => !nodes.some(o => o.isFolder && n.relativePath.startsWith(`${o.relativePath}/`)))
    }

    function iconFor(name: string) {
        if (isPropertiesFile(name)) return 'i-lucide-file-cog'
        const ext = getFileExtensionFromPath(name).toLowerCase()
        return [...fileTypes.items.values()].find(type => type.extensions.includes(ext))?.icon
    }

    async function remove(uuids: string[]) {
        if (deletedFiles() === 'permanent') return deleteFilesModal.open({fileIndexIds: uuids})
        return deleteFiles(uuids)
    }

    async function copy(uuids: string[]) {
        const files = topOf(uuids)
        if (!files.length) return
        try {
            await vertexInvoke('clipboard_files_set', {paths: files.map(f => f.fullPath)})
            $qt.success(t('app.editor.ui.filetree.copied', {count: files.length}))
        } catch (error) {
            $qt.error(t('app.editor.ui.filetree.copyFailed'), String(error))
        }
    }

    /** Brings `items` into `folder` through `importItems`; the new uuids. */
    async function addInto(folder: string, items: OutsideItem[], options: {copy?: boolean, inPlace?: boolean}) {
        try {
            return await importItems(items, absOf(folder), options) || []
        } catch (error) {
            $qt.error(t('app.editor.ui.filetree.importFailed'), String(error))
            return []
        }
    }

    async function paste(folder: string) {
        if (!session.rootPath) return []
        const paths = await vertexInvoke<string[]>('clipboard_files_get')
        if (!paths.length) {
            $qt.info(t('app.editor.ui.filetree.nothingToPaste'))
            return []
        }
        return addInto(folder, await outsideItemsAt(paths), {copy: true, inPlace: true})
    }

    /** Copies of the rows next to them ("Note 2.md"), as pasting them into their own folders would make. */
    async function duplicate(uuids: string[], added: Added) {
        const byFolder = new Map<string, string[]>()
        for (const node of topOf(uuids)) {
            const dir = parentPathOf(node.relativePath)
            byFolder.set(dir, [...byFolder.get(dir) ?? [], node.fullPath])
        }
        const made: string[] = []
        for (const [dir, paths] of byFolder) made.push(...await addInto(dir, await outsideItemsAt(paths), {copy: true, inPlace: true}))
        if (made.length) added?.(made)
    }

    async function importDrop(transfer: DataTransfer, folder: string, options: {copy?: boolean} = {}) {
        // Taken while the event lasts.
        const pending = outsideItems(transfer)
        return addInto(folder, await pending, {copy: options.copy})
    }

    async function openInTab(uuid: string) {
        await $navi.toWorkspaceTab(session.uuid, openTab(uuid))
    }

    /** Opens the New dialog for a file (with `ext`) or a folder, at `level` from the row `at` (the top level without one). */
    const openNew = (title: string, asFolder: boolean, ext: string | undefined, at?: string, level: 'above' | 'same' | 'below' = 'same') =>
        newFileModal.open({atFileIndexId: at, modalTitle: title, asFolder, asLevel: level, fileExt: asFolder ? undefined : ext})

    /** New note, New folder, then each file type's New: `label` (a key), and the extension; none for a folder. */
    const newKinds = () => [
        {label: 'app.editor.ui.filetree.newMarkdownFile', description: 'app.editor.ui.filetree.newFileDescription', icon: 'i-lucide-file-plus', ext: 'md' as string | undefined},
        {label: 'app.editor.ui.filetree.newFolder', description: 'app.editor.ui.filetree.newFolderDescription', icon: 'i-lucide-folder-plus', ext: undefined},
        ...[...fileTypes.items.values()].filter(type => type.new).map(type => ({label: type.new!.label, description: type.new!.description, icon: type.icon, ext: type.extensions[0]})),
    ]

    function newItems(folder = ''): PluginMenuItem[] {
        const at = folder ? getFileByPath(absOf(folder))?.uuid : undefined
        return newKinds().map(kind => ({
            label: t(kind.label),
            description: kind.description && t(kind.description),
            icon: kind.icon,
            onSelect: () => openNew(t(kind.label), !kind.ext, kind.ext, at, at ? 'below' : 'same'),
        }))
    }

    const pasteItem = (folder: string, added: Added): PluginMenuItem => ({
        label: t('app.editor.ui.filetree.paste'), icon: 'i-lucide-clipboard-paste', kbds: ['meta', 'v'],
        async onSelect() {
            const made = await paste(folder)
            if (made.length) added?.(made)
        },
    })
    const copyItem = (uuids: string[]): PluginMenuItem => ({label: t('app.editor.ui.filetree.copy'), icon: 'i-lucide-copy', kbds: ['meta', 'c'], onSelect: () => copy(uuids)})
    const duplicateItem = (uuids: string[], added: Added): PluginMenuItem => ({label: t('app.editor.ui.duplicate'), icon: 'i-lucide-files', onSelect: () => duplicate(uuids, added)})
    const deleteItem = (uuids: string[]): PluginMenuItem => ({label: t('app.editor.ui.delete'), color: 'error', icon: 'i-lucide-trash-2', onSelect: () => remove(uuids)})

    /** Plugins' items (`fileMenuItems`) for `uuids`, a group per registration. */
    function pluginItems(uuids: string[]): PluginMenuItem[][] {
        const files = uuids.map(getFileByUuid).filter(f => !!f)
        if (!files.length) return []
        return [...fileMenuItems.items.values()].map(def => def.items({session, files})).filter(group => group.length)
    }

    function emptyMenu(added: Added): PluginMenuItem[][] {
        return [newItems(), [pasteItem('', added)], [
            {label: undoLabel.value ? t('app.editor.ui.filetree.undoStep', {step: undoLabel.value}) : t('app.editor.ui.filetree.undo'), icon: 'i-lucide-undo-2', kbds: ['meta', 'z'], disabled: !undoLabel.value, onSelect: () => undo()},
            {label: redoLabel.value ? t('app.editor.ui.filetree.redoStep', {step: redoLabel.value}) : t('app.editor.ui.filetree.redo'), icon: 'i-lucide-redo-2', kbds: ['meta', 'shift', 'z'], disabled: !redoLabel.value, onSelect: () => redo()},
        ]]
    }

    function rowMenu(uuid: string, added: Added): PluginMenuItem[][] {
        const node = getFileByUuid(uuid)
        if (!node) return []
        const isFolder = node.isFolder, level = node.relativePath.split('/').length
        /** Above / this / under level submenu for creating a file (with `ext`) or folder relative to the row. */
        const newAt = (title: string, ext: string | undefined): PluginMenuItem[] => ([
            ['aboveLevel', 'i-lucide-folder-up', 'above', level <= 1],
            ['thisLevel', 'i-lucide-folder-dot', 'same', false],
            ['underLevel', 'i-lucide-folder-down', 'below', !isFolder],
        ] as const).map(([key, icon, asLevel, disabled]) => ({
            label: t(`app.editor.ui.filetree.${key}`),
            icon,
            disabled,
            onSelect: () => openNew(title, !ext, ext, uuid, asLevel),
        }))
        return [
            ...pluginItems([uuid]),
            [
                ...newKinds().map(kind => ({label: t(kind.label), icon: kind.ext ? kind.icon : 'i-lucide-file-plus', children: newAt(t(kind.label), kind.ext)})),
                {
                    label: t('app.editor.ui.filetree.newOpenFolderProperties'),
                    icon: 'i-lucide-file-plus',
                    disabled: !isFolder,
                    async onSelect() {
                        const id = getPropertiesFile(uuid) ?? (await createFile(uuid, PROPERTIES_FILE_NAMES[0], false, 'below'))?.uuid
                        if (id) await openInTab(id)
                    },
                },
            ],
            [
                {label: t('app.editor.ui.openInNewTab'), icon: 'i-lucide-square-plus', disabled: isFolder, onSelect: () => openInTab(uuid)},
                {label: t('app.editor.ui.openInDefaultApp'), icon: 'i-lucide-square-arrow-out-up-right', onSelect: () => $opener.openFileWithDefaultApp(node.fullPath)},
            ],
            [
                {label: t('app.editor.ui.copyFullPath'), icon: 'i-lucide-copy', onSelect: () => writeText(node.fullPath)},
                {label: t('app.editor.ui.copyRelativePath'), icon: 'i-lucide-copy', onSelect: () => writeText(node.relativePath)},
                {label: t('app.editor.ui.revealInFileExplorer'), icon: 'i-lucide-copy', onSelect: () => $opener.revealFilesInFileManager([node.fullPath])},
            ],
            [copyItem([uuid]), pasteItem(folderOf(uuid), added)],
            [
                duplicateItem([uuid], added),
                {label: t('app.editor.ui.moveFileTo'), icon: 'i-lucide-folder-tree', disabled: true}, // not implemented yet
                {label: t('app.editor.ui.rename'), icon: 'i-lucide-pen-line', onSelect: () => renameFileModal.open({fileIndexId: uuid, currentFileName: node.fileName})},
                deleteItem([uuid]),
            ],
        ]
    }

    /** The menu for a selection of several rows: what applies to all of them at once. */
    function selectionMenu(uuids: string[], added: Added): PluginMenuItem[][] {
        const files = uuids.map(getFileByUuid).filter(f => !!f)
        const notes = files.filter(f => !f.isFolder).map(f => f.uuid)
        const copyPaths = (key: 'fullPath' | 'relativePath') => writeText(files.map(f => f[key]).join('\n'))
        return [
            ...pluginItems(uuids),
            [{
                label: t('app.editor.ui.filetree.openInNewTabs'), icon: 'i-lucide-square-plus', disabled: !notes.length,
                async onSelect() {
                    const tab = openTabs(notes)
                    if (tab) await $navi.toWorkspaceTab(session.uuid, tab)
                },
            }],
            [
                {label: t('app.editor.ui.filetree.copyFullPaths'), icon: 'i-lucide-copy', onSelect: () => copyPaths('fullPath')},
                {label: t('app.editor.ui.filetree.copyRelativePaths'), icon: 'i-lucide-copy', onSelect: () => copyPaths('relativePath')},
                {label: t('app.editor.ui.revealInFileExplorer'), icon: 'i-lucide-copy', onSelect: () => $opener.revealFilesInFileManager(files.map(f => f.fullPath))},
            ],
            [copyItem(uuids), duplicateItem(uuids, added)],
            [deleteItem(uuids)],
        ]
    }

    const menuFor: SessionContext['files']['menuFor'] = (uuids, options = {}) =>
        !uuids.length ? emptyMenu(options.added) : uuids.length > 1 ? selectionMenu(uuids, options.added) : rowMenu(uuids[0]!, options.added)

    function dragStart(event: DragEvent, uuids: string[], grab: Element | null, ended: () => void) {
        if (!event.dataTransfer) return
        const nodes = topOf(uuids)
        const refs = nodes.map(n => (n.isFolder ? `${n.relativePath}/` : n.relativePath))
        const image = grab ? dragImage(grab, nodes.length, t('app.editor.ui.filetree.itemCount', {count: nodes.length})) : undefined
        // In Vertex, a native drag instead, which Finder or Explorer takes as files; back over Vertex it's still these rows
        // (`draggedRows`). The page never sees its `dragend`, so it ends through `dragOut`.
        if (isTauri() && image && session.rootPath) {
            event.preventDefault()
            const root = session.rootPath
            void dragImagePng(image).then(icon => dragOut(root, refs, icon, ended)).catch(error => {
                ended()
                $qt.error(t('app.editor.ui.filetree.dragFailed'), String(error))
            })
            return
        }
        // A move in a file browser; a copy (attach, link) where chat or a note takes the rows.
        event.dataTransfer.effectAllowed = 'copyMove'
        // WebKit starts a drag only with some data set.
        event.dataTransfer.setData('text/plain', nodes.map(n => n.relativePath).join('\n'))
        event.dataTransfer.setData(FILES_DRAG, JSON.stringify(refs))
        if (image) event.dataTransfer.setDragImage(image, 12, 12)
    }

    return {iconFor, menuFor, newItems, copy, paste, remove, importDrop, dragStart}
}
