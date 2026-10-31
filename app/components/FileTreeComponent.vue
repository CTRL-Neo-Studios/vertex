<script setup lang="ts">
import {StateKey} from "#shared/constants/app";
import type {TreeItem, ContextMenuItem} from '@nuxt/ui';
import type {UITreeNode} from '#shared/types/active/workspace';
import {isPropertiesFile, PROPERTIES_FILE_NAMES} from "#shared/utils/index/parse";
import {fileNameFromPath, getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import {writeText} from "@tauri-apps/plugin-clipboard-manager"
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import DeleteFilesModal from "~/components/Modals/DeleteFilesModal.vue";
import RenameFileModal from "~/components/Modals/RenameFileModal.vue";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";

const {t} = useI18n()

const props = defineProps<{ nodes: UITreeNode[], sessionId: string }>()
const modelValue = defineModel<string | null>()
const emit = defineEmits<{ (e: 'file-click', value: UITreeNode): void }>()

const $ovl = useOverlay()
const $navi = useAppNavigator()
const $opener = useAppOpener()
const session = useActiveSessions().getSession(props.sessionId)
const {openTab, activeTabUuid} = useActiveTabs(session)
const {getFileByUuid, getPropertiesFile} = useActiveWorkspaceIndex(session)
const {createFile} = useActiveWorkspaceTools(session)
const {config} = useAppSettings()

const newFileModal = $ovl.create(NewFileModal)
const deleteFilesModal = $ovl.create(DeleteFilesModal)
const renameFileModal = $ovl.create(RenameFileModal)
const expandedFolders = useState<string[]>(StateKey.expandedFolders(props.sessionId), () => [])

const formattedTreeData = computed<TreeItem[]>(() => {
    const build = (nodes: UITreeNode[]): TreeItem[] => nodes.map(node => {
        const icon = isPropertiesFile(node.fileName) ? 'i-lucide-file-cog'
            : typeof node.properties.icon === 'string' && node.properties.icon ? node.properties.icon : undefined
        const item: TreeItem = {
            id: node.uuid,
            label: node.fileName,
            icon,
            children: node.children ? build(node.children) : undefined,
            onSelect(e) {
                e?.preventDefault()
                onItemClick(item)
            },
            slot: node.isFolder ? 'folder' as const : 'file' as const,
            originalNodeData: node,
        }
        return item
    })
    return build(props.nodes)
})

function onItemClick(item: TreeItem) {
    const node = item.originalNodeData as UITreeNode
    if (!node.isFolder) emit('file-click', node)
    modelValue.value = item.id
}

async function openInTab(uuid: string) {
    await $navi.toWorkspaceTab(props.sessionId, openTab(uuid))
}

function getItemContextMenu(item: TreeItem, itemLevel: number, isFolder: boolean): ContextMenuItem[][] {
    const file = () => getFileByUuid(item.id)
    /** Above / this / under level submenu for creating a file or folder relative to `item`. */
    const newAt = (asFolder: boolean, title: string): ContextMenuItem[] => ([
        ['aboveLevel', 'i-lucide-folder-up', 'above', itemLevel <= 1],
        ['thisLevel', 'i-lucide-folder-dot', 'same', false],
        ['underLevel', 'i-lucide-folder-down', 'below', !isFolder],
    ] as const).map(([key, icon, asLevel, disabled]) => ({
        label: t(`app.editor.ui.filetree.${key}`),
        icon,
        disabled,
        onSelect: () => newFileModal.open({atFileIndexId: item.id, modalTitle: title, asFolder, asLevel, fileExt: asFolder ? undefined : 'md'}),
    }))

    return [
        [
            {label: t('app.editor.ui.filetree.newMarkdownFile'), icon: 'i-lucide-file-plus', children: newAt(false, t('app.editor.ui.filetree.newMarkdownFile'))},
            {label: t('app.editor.ui.filetree.newFolder'), icon: 'i-lucide-file-plus', children: newAt(true, t('app.editor.ui.filetree.newFolder'))},
            {label: t('app.editor.ui.filetree.newCanvas'), icon: 'i-lucide-file-plus', disabled: true}, // not implemented yet
            {label: t('app.editor.ui.filetree.newBase'), icon: 'i-lucide-file-plus', disabled: true}, // not implemented yet
            {
                label: t('app.editor.ui.filetree.newOpenFolderProperties'),
                icon: 'i-lucide-file-plus',
                disabled: !isFolder,
                async onSelect() {
                    const uuid = getPropertiesFile(item.id) ?? (await createFile(item.id, PROPERTIES_FILE_NAMES[0], false, 'below'))?.uuid
                    if (uuid) await openInTab(uuid)
                },
            },
        ],
        [
            {label: t('app.editor.ui.openInNewTab'), icon: 'i-lucide-square-plus', disabled: isFolder, onSelect: () => openInTab(item.id as string)},
            {label: t('app.editor.ui.openInDefaultApp'), icon: 'i-lucide-square-arrow-out-up-right', onSelect: () => file() && $opener.openFileWithDefaultApp(file()!.fullPath)},
        ],
        [
            {label: t('app.editor.ui.copyFullPath'), icon: 'i-lucide-copy', onSelect: () => writeText(file()?.fullPath ?? '')},
            {label: t('app.editor.ui.copyRelativePath'), icon: 'i-lucide-copy', onSelect: () => writeText(file()?.relativePath ?? '')},
            {label: t('app.editor.ui.revealInFileExplorer'), icon: 'i-lucide-copy', onSelect: () => file() && $opener.revealFilesInFileManager([file()!.fullPath])},
        ],
        [
            {label: t('app.editor.ui.duplicate'), icon: 'i-lucide-files', disabled: true}, // not implemented yet
            {label: t('app.editor.ui.moveFileTo'), icon: 'i-lucide-folder-tree', disabled: true}, // not implemented yet
            {label: t('app.editor.ui.rename'), icon: 'i-lucide-pen-line', onSelect: () => renameFileModal.open({fileIndexId: item.id, currentFileName: item.label ?? ''})},
            {label: t('app.editor.ui.delete'), color: 'error', icon: 'i-lucide-trash-2', onSelect: () => deleteFilesModal.open({fileIndexIds: [item.id]})},
        ],
    ]
}
</script>

<template>
    <UTree
        :items="formattedTreeData"
        expanded-icon="i-lucide-folder-open"
        collapsed-icon="i-lucide-folder-closed"
        v-model:expanded="expandedFolders"
        :get-key="(i: TreeItem) => i.id as string"
        :ui="{
            itemWithChildren: 'ps-0',
            listWithChildren: `ms-4.5 pl-2 border-muted border-dotted`
        }"
        size="sm"
    >
        <template #file-wrapper="{item, level}: {item: TreeItem, level: number}">
            <UContextMenu :items="getItemContextMenu(item, level, false)" size="sm">
                <UButton
                    size="sm"
                    :label="config?.viewConfig.fileTree.showFileExtInName ? item.label : fileNameFromPath(item.label ?? '', true)"
                    :variant="item.id == activeTabUuid ? 'soft' : 'ghost'"
                    :color="item.id == activeTabUuid ? 'primary' : 'neutral'"
                    :class="['select-none relative align-middle items-center justify-start text-left transition-all duration-300 after:transition-all after:duration-300 after:h-0 after:w-0 after:border-0 after:border-primary/0 after:left-0 after:absolute', item.id == activeTabUuid ? ' transition-all duration-300 pl-4 after:absolute after:border-primary after:h-1/2 after:w-0 after:border-[1.5px] after:rounded-lg after:left-1.5' : '']"
                    block
                    @click="onItemClick(item)"
                    :key="`${item.id}-file-tree-item`"
                    :icon="`${(config?.viewConfig.fileTree.showDefaultFileIcons) ? (config?.viewConfig.fileTree.allowCustomFileIcons && item.icon) ? item.icon : 'i-lucide-file' : (config?.viewConfig.fileTree.allowCustomFileIcons && item.icon) ? item.icon : '' }`"
                >
                    <template #trailing v-if="config?.viewConfig.fileTree.showFileExtAsTag">
                        <div class="grow"/>
                        <UBadge size="xs" :color="item.id == activeTabUuid ? 'primary' : 'neutral'" :variant="item.id == activeTabUuid ? 'solid' : 'soft'" :label="`.${getFileExtensionFromPath(item.label ?? '')}`"/>
                    </template>
                </UButton>
            </UContextMenu>
        </template>
        <template #folder="{item, expanded, level}: {item: TreeItem, expanded: boolean, level: number}">
            <UContextMenu :items="getItemContextMenu(item, level, true)" size="sm">
                <div :key="`${item.id}-file-tree-item`" class="inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none">
                    <UIcon v-if="config?.viewConfig.fileTree.showDefaultFolderIcons" class="text-sm size-4 shrink-0" :name="expanded ? ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-open') : ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-closed')" />
                    <span class="truncate text-xs overflow-ellipsis">{{ item.label }}</span>
                    <span class="grow"/>
                    <UIcon v-if="config?.viewConfig.fileTree.showFoldArrows" :class="['text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up" />
                </div>
            </UContextMenu>
        </template>
    </UTree>
</template>
