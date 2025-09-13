<script setup lang="ts">
import { computed } from 'vue';
import type { TreeItem, ContextMenuItem } from '@nuxt/ui';
import type { UITreeNode } from '#shared/types/active/workspace';
import useUuid from "~/composables/utility/useUuid";

const props = defineProps<{
    nodes: UITreeNode[],
    sessionId?: string
}>();

const modelValue = defineModel<string | null>()

const emit = defineEmits<{
    (e: 'file-click', value: UITreeNode): void,
    (e: 'folder-toggle', path: string): void
}>();

const expandedFolders = useState<string[]>(`active.workspace.expanded-file-tree-items-${props?.sessionId ?? useUuid()}`, () => [])

const formattedTreeData = computed(() => {
    const mapNodeToTreeItem = (node: UITreeNode): TreeItem => {
        const treeItem: TreeItem = {
            id: node.uuid,
            label: node.fileName,
            icon: node.isFolder ? undefined : 'i-lucide-file',
            children: node.children?.map(mapNodeToTreeItem),
            onSelect(e) {
                // e?.preventDefault();
                onItemClick(treeItem)
            },
            slot: node.isFolder ? 'folder' as const : 'file' as const,
            originalNodeData: node
        };

        return treeItem;
    };

    return props.nodes.map(mapNodeToTreeItem);
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
}

function getItemContextMenu(item: TreeItem): ContextMenuItem[][] {
    return [
        [
            {
                label: 'Open in New Tab',
                icon: 'i-lucide-square-plus'
            },
            {
                label: 'Open in Default App',
                icon: 'i-lucide-square-arrow-out-up-right'
            }
        ],
        [
            {
                label: 'Copy full path',
                icon: 'i-lucide-copy'
            },
            {
                label: 'Copy relative path',
                icon: 'i-lucide-copy'
            },
            {
                label: 'Reveal in File Explorer',
                icon: 'i-lucide-copy'
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
                icon: 'i-lucide-pen-line'
            },
            {
                label: 'Delete',
                color: 'error',
                icon: 'i-lucide-trash-2'
            }
        ]
    ]
}
</script>

<template>
    <UTree
        :items="formattedTreeData"
        v-model="modelValue"
        expanded-icon="i-lucide-folder-open"
        collapsed-icon="i-lucide-folder-closed"
        v-model:expanded="expandedFolders"
        value-key="id"
        :ui="{
            itemWithChildren: 'ps-0'
        }"
        size="sm"
    >
        <template #file-wrapper="{item, selected}">
            <UContextMenu :items="getItemContextMenu(item)" size="sm">
                <UButton size="sm" :label="item.label" :variant="selected ? 'soft' : 'ghost'" color="neutral" class="w-full select-none" @click="onItemClick(item)"/>
            </UContextMenu>
        </template>
        <template #folder="{item, expanded, selected}" class="p-0">
            <UContextMenu :items="getItemContextMenu(item)" size="sm">
                <div class="inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none">
                    <UIcon class="text-sm size-4 shrink-0" :name="expanded ? 'i-lucide-folder-open' : 'i-lucide-folder-closed'" />
                    <span class="truncate text-xs overflow-ellipsis">{{ item?.label }}</span>
                    <span class="flex-grow"/>
                    <UIcon :class="['text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up" />
                </div>
            </UContextMenu>
        </template>
    </UTree>
</template>