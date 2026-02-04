<script setup lang="ts">
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import FileTreeComponent from "~/components/FileTreeComponent.vue";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import useUuid from "~/composables/utility/useUuid";
import type {CommandPaletteGroup, CommandPaletteItem, ContextMenuItem, TreeItem} from "@nuxt/ui";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import {computed} from "vue";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $ovl = useOverlay()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    fileTree,
    fileIndex
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    isTabOpened,
    openTab,
    closeTab,
    tabs,
    activeTabUuid,
    setActiveTab,
    getActiveTab,
    clearTabs
} = useActiveTabs($sesh.getSession($sessionId))
const {
    leftPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))
const activeTreeItem = useState<string>(`active.workspace.active-tree-item-${unref($sessionId) ?? useUuid()}`, () => '')
const newFileModal = $ovl.create(NewFileModal)

watch(activeTabUuid, (newValue) => {
    activeTreeItem.value = newValue || ''
}, {deep: false})

async function onClickFile(item: Partial<UITreeNode>) {
    if (!item || !item.uuid) return;
    const tab = openTab(item.uuid)
    await $navi.toWorkspaceTab($sesh.getSession($sessionId)?.uuid || '', tab)
}

const contextMenuItems = ref<ContextMenuItem[][]>([
    [
        {
            label: 'New Markdown File',
            icon: 'i-lucide-file-plus',
            onSelect(e) {
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
            icon: 'i-lucide-folder-dot',
            onSelect(e) {
                newFileModal.open({
                    isFolder: true,
                    modalTitle: 'New Folder',
                    asFolder: true,
                    asLevel: 'same'
                })
            },
        }
    ]
])
</script>

<template>
    <UDashboardPanel
        v-if="!leftPanelCollapsed"
        side="left"
        data-tauri-drag-region
        :min-size="10"
        :max-size="30"
        :default-size="15"
        :collapsed-size="0"
        resizable
        :ui="{
            root: 'border-r border-default bg-submuted',
            body: 'px-2 sm:px-2 sm:py-0'
        }"
    >
        <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
            <UDashboardResizeHandle
                class="after:absolute after:inset-y-0 after:right-0 after:w-px hover:after:cursor-ew-resize after:cursor-ew-resize cursor-ew-resize after:top-0 after:bottom-0 hover:after:bg-primary hover:after:h-full after:justify-self-center after:items-center transition-all duration-300 after:transition-all after:duration-300"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <UDashboardNavbar :ui="{ root: 'border-b border-default h-(--ui-header-height) sm:px-1 p-2 w-full', center: 'w-full', left: 'pl-0', right: 'pr-0' }" data-tauri-drag-region>
                <template #default>
                    <SpaceOnOs detect-os="macos" :show-on-os="true" data-tauri-drag-region/>
                    <div class="grow" data-tauri-drag-region/>
                    <SidebarCollapserButton side="left"/>
                </template>
            </UDashboardNavbar>
            <UDashboardNavbar :ui="{ root: 'border-b border-default h-(--ui-header-height) sm:px-0 p-2 w-full', center: 'w-full gap-2', left: 'pl-2.5', right: 'pr-2.5' }" data-tauri-drag-region>
                <UDashboardSearchButton :kbds="['meta', 'p']" class="grow"/>
            </UDashboardNavbar>
        </template>
        <template #body>
            <UContextMenu :items="contextMenuItems">
                <UScrollArea orientation="vertical" class="no-scrollbar h-full relative" data-tauri-drag-region>
                    <FileTreeComponent class="py-2.5" :sessionId="$sessionId" v-model="activeTreeItem" :nodes="fileTree" @file-click="onClickFile"/>
                </UScrollArea>
            </UContextMenu>
        </template>
    </UDashboardPanel>
</template>

<style scoped>

</style>