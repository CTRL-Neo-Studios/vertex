<script setup lang="ts">
import { computed } from 'vue';
import type { TreeItem } from '@nuxt/ui';
import type { UITreeNode } from '#shared/types/active/workspace';
import useUuid from "~/composables/utility/useUuid";

const props = defineProps<{
    nodes: UITreeNode[],
    sessionId?: string
}>();

const modelValue = defineModel<string | undefined>()

const emit = defineEmits<{
    (e: 'file-click', value: UITreeNode): void
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
            slot: node.isFolder ? 'folder' as const : 'file' as const
        };

        treeItem.originalNodeData = node;

        return treeItem;
    };

    return props.nodes.map(mapNodeToTreeItem);
});

function onItemClick(item: TreeItem) {
    // We can access our preserved data here.
    const originalNode = item.originalNodeData as UITreeNode;

    // We only want to emit an event for files.
    if (originalNode && !originalNode.isFolder) {
        emit('file-click', originalNode);
    }
}
</script>

<template>
    <UTree
        :items="formattedTreeData"
        v-model="modelValue"
        expanded-icon="i-lucide-folder-open"
        collapsed-icon="i-lucide-folder-closed"
        :expanded="expandedFolders"
    />
</template>