<script setup lang="ts">
import {StateKey} from "#shared/constants/app";
import type {TreeItem, ContextMenuItem} from '@nuxt/ui';
import type {UITreeNode} from '#shared/types/active/workspace';
import {isPropertiesFile, PROPERTIES_FILE_NAMES} from "#shared/utils/index/parse";
import {fileNameFromPath, getFileExtensionFromPath, isWorkflowFile} from "#shared/utils/fs/filenames";
import {writeText} from "@tauri-apps/plugin-clipboard-manager"
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import DeleteFilesModal from "~/components/Modals/DeleteFilesModal.vue";
import RenameFileModal from "~/components/Modals/RenameFileModal.vue";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useWorkflowRunner} from "~/composables/workflows/useWorkflowRunner";
import {useScrollFade} from "~/composables/utility/useScrollFade";

const {t} = useI18n()

/** `emptyMenu`: the right-click menu outside any row (the tree fills its panel, so it's the panel's too). */
const props = defineProps<{ nodes: UITreeNode[], sessionId: string, emptyMenu?: ContextMenuItem[][] }>()
const emit = defineEmits<{ (e: 'file-click', value: UITreeNode): void }>()

const $ovl = useOverlay()
const $navi = useAppNavigator()
const $opener = useAppOpener()
const session = useActiveSessions().getSession(props.sessionId)
const {openTab, activeTabUuid} = useActiveTabs(session)
const {getFileByUuid, getPropertiesFile, getFilteredFiles} = useActiveWorkspaceIndex(session)
const {createFile} = useActiveWorkspaceTools(session)
// The workspace's own view settings, when it overrides them.
const config = useSettingsScope().effective
// Workflows run on a workspace folder; a session without one gets no run items.
const runner = session?.rootPath ? useWorkflowRunner(session) : undefined

const newFileModal = $ovl.create(NewFileModal)
const deleteFilesModal = $ovl.create(DeleteFilesModal)
const renameFileModal = $ovl.create(RenameFileModal)
const expandedFolders = useState<string[]>(StateKey.expandedFolders(props.sessionId), () => [])
// Once per index change, not per note row each time the tree renders.
const workflows = computed(() => getFilteredFiles(f => !f.isFolder && isWorkflowFile(getFileExtensionFromPath(f.fileName))))

const formattedTreeData = computed<TreeItem[]>(() => {
    const build = (nodes: UITreeNode[]): TreeItem[] => nodes.map(node => {
        const icon = isPropertiesFile(node.fileName) ? 'i-lucide-file-cog'
            : isWorkflowFile(getFileExtensionFromPath(node.fileName)) ? 'i-lucide-workflow'
            : node.icon
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
}

// One menu for the whole tree (a menu per row gave every row a menu root, and a virtual list remounts rows as it
// scrolls): the right-clicked row (`data-id`, `data-level`) picks its items before the menu opens.
const menuRow = shallowRef<{ item: TreeItem, level: number }>()
function findItem(items: TreeItem[], id: string): TreeItem | undefined {
    for (const item of items) {
        const found = item.id === id ? item : item.children && findItem(item.children, id)
        if (found) return found
    }
}
function onContextMenu(event: MouseEvent) {
    const row = (event.target as Element | null)?.closest('li')?.querySelector<HTMLElement>('[data-id]')
    const item = row?.dataset.id ? findItem(formattedTreeData.value, row.dataset.id) : undefined
    menuRow.value = item && {item, level: Number(row!.dataset.level)}
}
const fileIcon = (item: TreeItem) => {
    const tree = config.value?.viewConfig.fileTree
    const custom = tree?.allowCustomFileIcons && item.icon
    return custom || (tree?.showDefaultFileIcons ? 'i-lucide-file' : '')
}
const menuItems = computed(() => {
    const row = menuRow.value
    return row ? getItemContextMenu(row.item, row.level, (row.item.originalNodeData as UITreeNode).isFolder) : props.emptyMenu ?? []
})

const treeRef = useTemplateRef<{ $el: HTMLElement }>('treeRef')
const fade = useScrollFade(() => treeRef.value?.$el)
// The virtual tree draws rows flat: indents and the nesting guides (at each parent's icon) come from the level, as
// Nuxt UI's flat rows do for its own link (`sm`: 2.5 + 6 per level, in spacing units).
const indent = (level: number, extra = 0) => `calc(var(--spacing) * ${(level - 1) * 6 + 2.5 + extra})`
const guide = (parentLevel: number) => `calc(var(--spacing) * ${(parentLevel - 1) * 6 + 4.5})`

async function openInTab(uuid: string) {
    await $navi.toWorkspaceTab(props.sessionId, openTab(uuid))
}

function getItemContextMenu(item: TreeItem, itemLevel: number, isFolder: boolean): ContextMenuItem[][] {
    const file = () => getFileByUuid(item.id)
    /** Above / this / under level submenu for creating a file (with `ext`) or folder relative to `item`. */
    const newAt = (asFolder: boolean, title: string, ext = 'md'): ContextMenuItem[] => ([
        ['aboveLevel', 'i-lucide-folder-up', 'above', itemLevel <= 1],
        ['thisLevel', 'i-lucide-folder-dot', 'same', false],
        ['underLevel', 'i-lucide-folder-down', 'below', !isFolder],
    ] as const).map(([key, icon, asLevel, disabled]) => ({
        label: t(`app.editor.ui.filetree.${key}`),
        icon,
        disabled,
        onSelect: () => newFileModal.open({atFileIndexId: item.id, modalTitle: title, asFolder, asLevel, fileExt: asFolder ? undefined : ext}),
    }))

    const node = item.originalNodeData as UITreeNode
    const ext = getFileExtensionFromPath(node.fileName)
    /** `.workflow`: Run / Dry run. A note: run one of the vault's workflows on it. */
    const runItems = (): ContextMenuItem[] => {
        if (!runner || isFolder) return []
        if (isWorkflowFile(ext)) return [
            {label: t('app.editor.ui.workflow.run'), icon: 'i-lucide-play', onSelect: () => runner.runFile(node.relativePath, false)},
            {label: t('app.editor.ui.workflow.dryRun'), icon: 'i-lucide-flask-conical', onSelect: () => runner.runFile(node.relativePath, true)},
        ]
        if (ext.toLowerCase() !== 'md') return []
        return [{
            label: t('app.editor.ui.workflow.runOnNote'),
            icon: 'i-lucide-workflow',
            disabled: !workflows.value.length,
            children: workflows.value.map(w => ({
                label: fileNameFromPath(w.fileName, true),
                description: w.relativePath,
                icon: 'i-lucide-workflow',
                onSelect: () => runner.runFile(w.relativePath, false, {note: node.relativePath}),
            })),
        }]
    }

    const groups: ContextMenuItem[][] = [
        runItems(),
        [
            {label: t('app.editor.ui.filetree.newMarkdownFile'), icon: 'i-lucide-file-plus', children: newAt(false, t('app.editor.ui.filetree.newMarkdownFile'))},
            {label: t('app.editor.ui.filetree.newFolder'), icon: 'i-lucide-file-plus', children: newAt(true, t('app.editor.ui.filetree.newFolder'))},
            {label: t('app.editor.ui.filetree.newCanvas'), icon: 'i-lucide-file-plus', disabled: true}, // not implemented yet
            {label: t('app.editor.ui.filetree.newBase'), icon: 'i-lucide-file-plus', disabled: true}, // not implemented yet
            {label: t('app.editor.ui.filetree.newWorkflow'), icon: 'i-lucide-workflow', children: newAt(false, t('app.editor.ui.filetree.newWorkflow'), 'workflow')},
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
    return groups.filter(group => group.length)
}
</script>

<template>
    <UContextMenu :items="menuItems" size="sm">
        <UTree
            ref="treeRef"
            :items="formattedTreeData"
            virtualize
            expanded-icon="i-lucide-folder-open"
            collapsed-icon="i-lucide-folder-closed"
            v-model:expanded="expandedFolders"
            :get-key="(i: TreeItem) => i.id as string"
            :class="['no-scrollbar h-full py-2.5', fade]"
            data-tauri-drag-region
            size="sm"
            @contextmenu.capture="onContextMenu"
        >
            <template #file-wrapper="{item, level}: {item: TreeItem, level: number}">
                <UButton
                    size="sm"
                    :data-id="item.id"
                    :data-level="level"
                    :label="config?.viewConfig.fileTree.showFileExtInName ? item.label : fileNameFromPath(item.label ?? '', true)"
                    :variant="item.id == activeTabUuid ? 'soft' : 'ghost'"
                    :color="item.id == activeTabUuid ? 'primary' : 'neutral'"
                    :class="['select-none relative align-middle items-center justify-start text-left transition-all duration-300 after:transition-all after:duration-300 after:h-0 after:w-0 after:border-0 after:border-primary/0 after:left-0 after:absolute', item.id == activeTabUuid ? ' transition-all duration-300 after:absolute after:border-primary after:h-1/2 after:w-0 after:border-[1.5px] after:rounded-lg after:left-1.5' : '']"
                    :style="{paddingInlineStart: indent(level, item.id == activeTabUuid ? 1.5 : 0)}"
                    block
                    @click="onItemClick(item)"
                >
                    <template #leading>
                        <span v-for="k in level - 1" :key="k" class="absolute inset-y-0 border-s border-dotted border-muted pointer-events-none" :style="{insetInlineStart: guide(k)}"/>
                        <UIcon v-if="fileIcon(item)" :name="fileIcon(item)" class="size-4 shrink-0"/>
                    </template>
                    <template #trailing v-if="config?.viewConfig.fileTree.showFileExtAsTag">
                        <div class="grow"/>
                        <UBadge size="xs" :color="item.id == activeTabUuid ? 'primary' : 'neutral'" :variant="item.id == activeTabUuid ? 'solid' : 'soft'" :label="`.${getFileExtensionFromPath(item.label ?? '')}`"/>
                    </template>
                </UButton>
            </template>
            <template #folder="{item, expanded, level}: {item: TreeItem, expanded: boolean, level: number}">
                <div :data-id="item.id" :data-level="level" class="inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none">
                    <span v-for="k in level - 1" :key="k" class="absolute inset-y-0 border-s border-dotted border-muted pointer-events-none" :style="{insetInlineStart: guide(k)}"/>
                    <UIcon v-if="config?.viewConfig.fileTree.showDefaultFolderIcons" class="text-sm size-4 shrink-0" :name="expanded ? ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-open') : ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-closed')" />
                    <span class="truncate text-xs overflow-ellipsis">{{ item.label }}</span>
                    <span class="grow"/>
                    <UIcon v-if="config?.viewConfig.fileTree.showFoldArrows" :class="['text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up" />
                </div>
            </template>
        </UTree>
    </UContextMenu>
</template>
