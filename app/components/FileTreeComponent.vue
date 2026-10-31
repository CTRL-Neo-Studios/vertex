<script setup lang="ts">
import {StateKey} from "#shared/constants/app";
import type { TreeItem, ContextMenuItem } from '@nuxt/ui';
import type { UITreeNode } from '#shared/types/active/workspace';
import useUuid from "~/composables/utility/useUuid";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {writeText} from "@tauri-apps/plugin-clipboard-manager"
import DeleteFilesModal from "~/components/Modals/DeleteFilesModal.vue";
import RenameFileModal from "~/components/Modals/RenameFileModal.vue";
import {useFileIO} from "~/composables/io/useFileIO";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";

const { t } = useI18n()

const props = defineProps<{
    nodes: UITreeNode[],
    sessionId?: string,
    onlyFolders?: boolean,
    noContextMenu?: boolean
}>();
const modelValue = defineModel<string | null>()
const lastFileItem = defineModel<string | null>('lastFileItem')
const emit = defineEmits<{
    (e: 'file-click', value: UITreeNode): void,
    (e: 'folder-toggle', path: string): void
}>();
const $ovl = useOverlay()
const $navi = useAppNavigator()
const $route = useRoute()
const $fileio = useFileIO()
const $opener = useAppOpener()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    getSession
} = useActiveSessions()
const {
    openTab,
    activeTabUuid
} = useActiveTabs(getSession($sessionId))
const {
    getFileByUuid,
    getPropertiesFile,
} = useActiveWorkspaceIndex(getSession($sessionId))
const {
    createPropertiesFile
} = useActiveWorkspaceTools(getSession($sessionId))
const {
    config
} = useAppSettings()

const newFileModal = $ovl.create(NewFileModal)
const deleteFilesModal = $ovl.create(DeleteFilesModal)
const renameFileModal = $ovl.create(RenameFileModal)
// No sessionId → standalone picker (MoveFileModal): keep expansion local instead of sharing the sidebar's.
const expandedFolders = props.sessionId
    ? useState<string[]>(StateKey.expandedFolders(props.sessionId), () => [])
    : ref<string[]>([])
const $ftMemo = useActiveFileTreeMemo(getSession($sessionId))

const formattedTreeData = computed<TreeItem[]>(() => {
    // A single, powerful recursive function to build the tree.
    const buildTree = (nodes: UITreeNode[]): TreeItem[] => {
        return nodes.reduce((accumulator, node) => {
            // Condition: Include the node if we are showing all items OR if the item is a folder.
            if (!props?.onlyFolders || node.isFolder) {

                // Note: The `treeItem` needs to be declared so it can be referenced in its own event handlers.
                let treeItem: TreeItem;
                const nodeIcon: string | undefined = (node.fileName === 'properties.yml' || node.fileName === 'properties.yaml') ? 'i-lucide-file-cog' : (node.properties.icon && typeof node.properties.icon === 'string') ? node.properties.icon : undefined

                treeItem = {
                    id: node.uuid,
                    label: `${node.fileName}${node.uuid.slice(0,4)}`,
                    icon: nodeIcon,

                    // The recursive call correctly applies the same logic to children.
                    children: node.children ? buildTree(node.children) : undefined,

                    onSelect(e) {
                        e?.preventDefault();
                        onItemClick(treeItem);
                    },

                    // === The key conditional logic for onToggle ===
                    onToggle(e) {
                        // If "folders only" mode is active, the toggle action
                        // should also trigger the primary item click behavior.
                        if (props?.onlyFolders) {
                            onItemClick(treeItem);
                        }
                        // Otherwise, when showing files and folders, toggling does nothing.
                    },

                    slot: node.isFolder ? 'folder' as const : 'file' as const,
                    originalNodeData: node
                };

                if (treeItem.label) $ftMemo.putToLabel(treeItem.label)

                accumulator.push(treeItem);
            }
            return accumulator;
        }, [] as TreeItem[]);
    };

    return buildTree(props.nodes) || [] as TreeItem[];
});

function onItemClick(item: TreeItem) {
    // We can access our preserved data here.
    const originalNode = item.originalNodeData as UITreeNode;

    // We only want to emit an event for files.
    if (originalNode.isFolder) {
        emit('folder-toggle', originalNode.fullPath);
    } else {
        emit('file-click', originalNode)
        lastFileItem.value = item.id
    }
    modelValue.value = item.id
}

function getItemContextMenu(item: TreeItem, itemLevel: number, isFolder: boolean = false): ContextMenuItem[][] {
    if (props?.noContextMenu) return [];
    return [
        [
            {
                label: t('app.editor.ui.filetree.newMarkdownFile'),
                icon: 'i-lucide-file-plus',
                children: [
                    {
                        label: t('app.editor.ui.filetree.aboveLevel'),
                        icon: 'i-lucide-folder-up',
                        disabled: itemLevel <= 1,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: t('app.editor.ui.filetree.newMarkdownFile'),
                                asFolder: false,
                                asLevel: 'above',
                                fileExt: 'md'
                            })
                        },
                    },
                    {
                        label: t('app.editor.ui.filetree.thisLevel'),
                        icon: 'i-lucide-folder-dot',
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: t('app.editor.ui.filetree.newMarkdownFile'),
                                asFolder: false,
                                asLevel: 'same',
                                fileExt: 'md'
                            })
                        },
                    },
                    {
                        label: t('app.editor.ui.filetree.underLevel'),
                        icon: 'i-lucide-folder-down',
                        disabled: !isFolder,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: t('app.editor.ui.filetree.newMarkdownFile'),
                                asFolder: false,
                                asLevel: 'below',
                                fileExt: 'md'
                            })
                        },
                    }
                ]
            },
            {
                label: t('app.editor.ui.filetree.newFolder'),
                icon: 'i-lucide-file-plus',
                children: [
                    {
                        label: t('app.editor.ui.filetree.aboveLevel'),
                        icon: 'i-lucide-folder-up',
                        disabled: itemLevel <= 1,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: t('app.editor.ui.filetree.newFolder'),
                                asFolder: true,
                                asLevel: 'above'
                            })
                        },
                    },
                    {
                        label: t('app.editor.ui.filetree.thisLevel'),
                        icon: 'i-lucide-folder-dot',
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: t('app.editor.ui.filetree.newFolder'),
                                asFolder: true,
                                asLevel: 'same'
                            })
                        },
                    },
                    {
                        label: t('app.editor.ui.filetree.underLevel'),
                        icon: 'i-lucide-folder-down',
                        disabled: !isFolder,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: t('app.editor.ui.filetree.newFolder'),
                                asFolder: true,
                                asLevel: 'below'
                            })
                        },
                    }
                ]
            },
            {
                label: t('app.editor.ui.filetree.newCanvas'),
                icon: 'i-lucide-file-plus',
                disabled: true, // TODO: implement functionality
            },
            {
                label: t('app.editor.ui.filetree.newBase'),
                icon: 'i-lucide-file-plus',
                disabled: true, // TODO: implement functionality
            },
            {
                label: t('app.editor.ui.filetree.newOpenFolderProperties'),
                icon: 'i-lucide-file-plus',
                disabled: !isFolder,
                async onSelect(e: Event) {
                    const propFileUuid = getPropertiesFile(item.id)
                    if (propFileUuid != undefined) {
                        const tab = openTab(propFileUuid)
                        await $navi.toWorkspaceTab($sessionId, tab)
                    } else {
                        const result = await createPropertiesFile(item.id)
                        if (result) {
                            const tab = openTab(result.uuid)
                            await $navi.toWorkspaceTab($sessionId, tab)
                        }
                        // console.log(result)
                    }
                }
            }
        ],
        [
            {
                label: t('app.editor.ui.openInNewTab'),
                icon: 'i-lucide-square-plus',
                disabled: isFolder,
                async onSelect(e: Event) {
                    const tab = openTab(item.id)
                    await $navi.toWorkspaceTab($sessionId, tab)
                }
            },
            {
                label: t('app.editor.ui.openInDefaultApp'),
                icon: 'i-lucide-square-arrow-out-up-right',
                async onSelect(e) {
                    const file = getFileByUuid(item.id)
                    if (file)
                        await $opener.openFileWithDefaultApp(file.fullPath)
                }
            }
        ],
        [
            {
                label: t('app.editor.ui.copyFullPath'),
                icon: 'i-lucide-copy',
                async onSelect(e: Event) {
                    await writeText(getFileByUuid(item.id)?.fullPath ?? '')
                }
            },
            {
                label: t('app.editor.ui.copyRelativePath'),
                icon: 'i-lucide-copy',
                async onSelect(e: Event) {
                    await writeText(getFileByUuid(item.id)?.relativePath ?? '')
                }
            },
            {
                label: t('app.editor.ui.revealInFileExplorer'),
                icon: 'i-lucide-copy',
                async onSelect(e) {
                    const file = getFileByUuid(item.id)
                    if (file)
                        await $opener.revealFilesInFileManager([file.fullPath])
                }
            }
        ],
        [
            {
                label: 'Duplicate',
                icon: 'i-lucide-files',
                disabled: true
            },
            {
                label: t('app.editor.ui.moveFileTo'),
                icon: 'i-lucide-folder-tree',
                disabled: true
            },
            {
                label: 'Rename',
                icon: 'i-lucide-pen-line',
                async onSelect(e: Event) {
                    if (item?.label)
                        renameFileModal.open({
                            fileIndexId: item.id,
                            currentFileName: $fileio.processFileNameFromPath(item.label)
                        })
                }
            },
            {
                label: 'Delete',
                color: 'error',
                icon: 'i-lucide-trash-2',
                async onSelect(e: Event) {
                    deleteFilesModal.open({
                        fileIndexIds: [item.id]
                    })
                }
            }
        ]
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
                    :label="config?.viewConfig.fileTree.showFileExtInName ? $ftMemo.getFromLabel(item.label).name : $ftMemo.getFromLabel(item.label).unextName"
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
                        <UBadge size="xs" :color="item.id == activeTabUuid ? 'primary' : 'neutral'" :variant="item.id == activeTabUuid ? 'solid' : 'soft'" :label="`.${$ftMemo.getFromLabel(item.label).ext}`"/>
                    </template>
                </UButton>
            </UContextMenu>
        </template>
        <template #folder="{item, expanded, level}: {item: TreeItem, expanded: boolean, level: number}" class="p-0">
            <UContextMenu :items="getItemContextMenu(item, level, true)" size="sm">
                <div :key="`${item.id}-file-tree-item`" :class="['inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none', onlyFolders ? item.id == activeTabUuid ? 'border border-primary bg-primary/30 text-primary' : '' : '' ]">
                    <UIcon v-if="config?.viewConfig.fileTree.showDefaultFolderIcons" class="text-sm size-4 shrink-0" :name="expanded ? ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-open') : ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-closed')" />
                    <span class="truncate text-xs overflow-ellipsis">{{ $ftMemo.getFromLabel(item.label).name }}</span>
                    <span class="grow"/>
                    <UIcon v-if="config?.viewConfig.fileTree.showFoldArrows" :class="['text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up" />
                </div>
            </UContextMenu>
        </template>
    </UTree>
</template>
