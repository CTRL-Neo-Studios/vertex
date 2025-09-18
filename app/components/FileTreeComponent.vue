<script setup lang="ts">
import { computed } from 'vue';
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

const props = defineProps<{
    nodes: UITreeNode[],
    sessionId?: string,
    onlyFolders?: boolean,
    noContextMenu?: boolean
}>();
const modelValue = defineModel<string | null>()
const emit = defineEmits<{
    (e: 'file-click', value: UITreeNode): void,
    (e: 'folder-toggle', path: string): void
}>();
const $ovl = useOverlay()
const $navi = useAppNavigator()
const $route = useRoute()
const $fileio = useFileIO()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    getSession
} = useActiveSessions()
const {
    openTab
} = useActiveTabs(getSession($sessionId))
const {
    getFileByUuid
} = useActiveWorkspaceIndex(getSession($sessionId))

const newFileModal = $ovl.create(NewFileModal)
const deleteFilesModal = $ovl.create(DeleteFilesModal)
const renameFileModal = $ovl.create(RenameFileModal)
const expandedFolders = useState<string[]>(`active.workspace.expanded-file-tree-items-${props?.sessionId ?? useUuid()}`, () => [])

const formattedTreeData = computed(() => {
    // A single, powerful recursive function to build the tree.
    const buildTree = (nodes: UITreeNode[]): TreeItem[] => {
        return nodes.reduce((accumulator, node) => {
            // Condition: Include the node if we are showing all items OR if the item is a folder.
            if (!props?.onlyFolders || node.isFolder) {

                // Note: The `treeItem` needs to be declared so it can be referenced in its own event handlers.
                let treeItem: TreeItem;

                treeItem = {
                    id: node.uuid,
                    label: node.fileName,
                    icon: node.isFolder ? undefined : 'i-lucide-file',

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

                accumulator.push(treeItem);
            }
            return accumulator;
        }, [] as TreeItem[]);
    };

    return buildTree(props.nodes);
});

function onItemClick(item: TreeItem) {
    // We can access our preserved data here.
    const originalNode = item.originalNodeData as UITreeNode;

    // We only want to emit an event for files.
    if (originalNode.isFolder) {
        emit('folder-toggle', originalNode.fullPath);
    } else {
        emit('file-click', originalNode)
    }
    modelValue.value = item.id
}

function getItemContextMenu(item: TreeItem, itemLevel: number, isFolder: boolean = false): ContextMenuItem[][] {
    if (props?.noContextMenu) return [];
    return [
        [
            {
                label: 'New Markdown File...',
                icon: 'i-lucide-file-plus',
                children: [
                    {
                        label: 'Above Level',
                        icon: 'i-lucide-folder-up',
                        disabled: itemLevel <= 1,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: 'New Markdown File',
                                asFolder: false,
                                asLevel: 'above',
                                fileExt: 'md'
                            })
                        },
                    },
                    {
                        label: 'This Level',
                        icon: 'i-lucide-folder-dot',
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: 'New Markdown File',
                                asFolder: false,
                                asLevel: 'same',
                                fileExt: 'md'
                            })
                        },
                    },
                    {
                        label: 'Under Level',
                        icon: 'i-lucide-folder-down',
                        disabled: !isFolder,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: 'New Markdown File',
                                asFolder: false,
                                asLevel: 'below',
                                fileExt: 'md'
                            })
                        },
                    }
                ]
            },
            {
                label: 'New Folder...',
                icon: 'i-lucide-file-plus',
                children: [
                    {
                        label: 'Above Level',
                        icon: 'i-lucide-folder-up',
                        disabled: itemLevel <= 1,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: 'New Folder',
                                asFolder: true,
                                asLevel: 'above'
                            })
                        },
                    },
                    {
                        label: 'This Level',
                        icon: 'i-lucide-folder-dot',
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: 'New Folder',
                                asFolder: true,
                                asLevel: 'same'
                            })
                        },
                    },
                    {
                        label: 'Under Level',
                        icon: 'i-lucide-folder-down',
                        disabled: !isFolder,
                        onSelect(e) {
                            newFileModal.open({
                                isFolder: isFolder,
                                atFileIndexId: item.id,
                                modalTitle: 'New Folder',
                                asFolder: true,
                                asLevel: 'below'
                            })
                        },
                    }
                ]
            },
            {
                label: 'New Canvas',
                icon: 'i-lucide-file-plus',
                disabled: true,
            },
            {
                label: 'New Table',
                icon: 'i-lucide-file-plus',
                disabled: true,
            },
        ],
        [
            {
                label: 'Open in New Tab',
                icon: 'i-lucide-square-plus',
                disabled: isFolder,
                async onSelect(e: Event) {
                    const tab = openTab(item.id)
                    await $navi.toWorkspaceTab($sessionId, tab)
                }
            },
            {
                label: 'Open in Default App',
                icon: 'i-lucide-square-arrow-out-up-right',
                disabled: true
            }
        ],
        [
            {
                label: 'Copy full path',
                icon: 'i-lucide-copy',
                async onSelect(e: Event) {
                    await writeText(getFileByUuid(item.id)?.fullPath ?? '')
                }
            },
            {
                label: 'Copy relative path',
                icon: 'i-lucide-copy',
                async onSelect(e: Event) {
                    await writeText(getFileByUuid(item.id)?.relativePath ?? '')
                }
            },
            {
                label: 'Reveal in File Explorer',
                icon: 'i-lucide-copy',
                disabled: true
            }
        ],
        [
            {
                label: 'Duplicate',
                icon: 'i-lucide-files'
            },
            {
                label: 'Move file to...',
                icon: 'i-lucide-folder-tree'
            },
            {
                label: 'Rename',
                icon: 'i-lucide-pen-line',
                async onSelect(e: Event) {
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
        value-key="id"
        :ui="{
            itemWithChildren: 'ps-0',
            listWithChildren: `ms-4.5 pl-2 dark:border-neutral-700`
        }"
        size="sm"
    >
        <template #file-wrapper="{item, level}">
            <UContextMenu :items="getItemContextMenu(item, level, false)" size="sm">
                <UButton size="sm" :label="item.label" :variant="item.id == modelValue ? 'subtle' : 'ghost'" :color="item.id == modelValue ? 'primary' : 'neutral'" class="w-full select-none" @click="onItemClick(item)"/>
            </UContextMenu>
        </template>
        <template #folder="{item, expanded, level}" class="p-0">
            <UContextMenu :items="getItemContextMenu(item, level, true)" size="sm">
                <div :class="['inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none', onlyFolders ? item.id == modelValue ? 'border border-primary bg-primary/30 text-primary' : '' : '' ]">
                    <UIcon class="text-sm size-4 shrink-0" :name="expanded ? 'i-lucide-folder-open' : 'i-lucide-folder-closed'" />
                    <span class="truncate text-xs overflow-ellipsis">{{ item?.label }}</span>
                    <span class="flex-grow"/>
                    <UIcon :class="['text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up" />
                </div>
            </UContextMenu>
        </template>
    </UTree>
</template>