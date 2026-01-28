<script setup lang="ts">
import type {CommandPaletteGroup, CommandPaletteItem} from "@nuxt/ui";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import {useFileIO} from "~/composables/io/useFileIO";

const $route = useRoute()
const $ovl = useOverlay()
const sessionId = computed<string>(() => $route.params.sessionId as string)
const $sesh = useActiveSessions()
const $navi = useAppNavigator()
const {
    fileIndex
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    openTab
} = useActiveTabs($sesh.getSession(sessionId))
const newFileModal = $ovl.create(NewFileModal)

async function onClickFile(item: Partial<UITreeNode>) {
    if (!item || !item.uuid) return;
    const tab = openTab(item.uuid)
    await $navi.toWorkspaceTab($sesh.getSession(sessionId)?.uuid || '', tab)
}

const paletteItemFiles = computed(() => {
    const items: CommandPaletteItem[] = []
    for (const path in unref(fileIndex)) {
        const item = unref(fileIndex)[path]
        if (item && !item.isFolder)
            items.push({
                id: item.uuid,
                label: item.fileName,
                description: item.relativePath,
                async onSelect() {
                    await onClickFile({
                        uuid: item.uuid
                    })
                }
            })
    }
    return items
})

const commandPaletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
    {
        id: 'quick-actions',
        label: 'Quick Actions',
        items: [
            {
                label: 'New Markdown File',
                description: 'Creates a new markdown file in the workspace root directory.',
                icon: 'i-lucide-file-plus',
                onSelect() {
                    newFileModal.open({
                        isFolder: false,
                        modalTitle: 'New Markdown File',
                        asFolder: false,
                        asLevel: 'same',
                        fileExt: 'md'
                    })
                }
            },
            {
                label: 'New Folder',
                description: 'Creates a new folder in the workspace root directory.',
                icon: 'i-lucide-folder-dot',
                onSelect() {
                    newFileModal.open({
                        isFolder: true,
                        modalTitle: 'New Folder',
                        asFolder: true,
                        asLevel: 'same'
                    })
                }
            }
        ]
    },
    {
        id: 'files',
        label: `Files (${unref(paletteItemFiles).length} recursed)`,
        items: unref(paletteItemFiles),
    }
])
</script>

<template>
    <UDashboardSearch shortcut="meta_p" :groups="commandPaletteGroups"/>
</template>

<style scoped>

</style>