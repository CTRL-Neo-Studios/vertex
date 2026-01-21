<script setup lang="ts">
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type { DropdownMenuItem } from '@nuxt/ui'
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import type {ActiveSinglespaceFileIndex, ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import useQuickToasts from "~/composables/utility/useQuickToasts";

const $route = useRoute()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $aseshNavi = useAppSessionNavigator()
const $qt = useQuickToasts()
const {
    closeTab,
    openTab,
    activeTabUuid,
    tabs,
    getActiveTab,
    clearTabs
} = useActiveTabs($sesh.getSession(sessionId))
const {
    getFileByUuid: getWorkspaceFileByUuid
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    getFileByUuid: getSinglespaceFileByUuid,
    isIndexTemporary: isSinglespaceIndexTemporary,
    setTemporaryIndex: setSinglespaceTempIndex
} = useActiveSinglespaceIndex($sesh.getSession(sessionId))
const {
    leftPanelCollapsed,
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession(sessionId))

const isWorkspace = computed(() => $sesh.isSessionWorkspace(sessionId))

async function navigateTabInContext(sessionId: PossiblyRef<string | undefined>, tab?: ActiveTab) {
    if (tab) {
        if (unref(isWorkspace))
            await $navi.toWorkspaceTab(sessionId, tab)
        else
            await $navi.toSinglespaceTab(sessionId, tab)
    } else {
        if (unref(isWorkspace))
            await $navi.toWorkspaceEmptyTab(sessionId)
        else
            await $navi.toSinglespaceEmptyTab(sessionId)
    }
}

async function toTab(tab: ActiveTab) {
    openTab(tab.fileUuid)
    await navigateTabInContext(sessionId, tab)
}
async function exitTab(tab: ActiveTab) {
    closeTab(tab.fileUuid)
    if (unref(tabs).length == 0) {
        await navigateTabInContext(sessionId)
    } else {
        const uuid = unref(activeTabUuid)
        if (!uuid) {
            await navigateTabInContext(sessionId)
            return;
        }

        const activeTab = getActiveTab(uuid)
        if (activeTab) {
            await navigateTabInContext(sessionId, activeTab)
            return;
        }

        await navigateTabInContext(sessionId)
        return;
    }
}

const dropdownItems = computed<DropdownMenuItem[][]>(() => {
    let items: DropdownMenuItem[][] = [
        [{
            label: 'New Tab',
            icon: 'i-lucide-plus',
            async onSelect() {
                openTab(setSinglespaceTempIndex().uuid)
            },
            disabled: true // Disabled for now; I'm currently figuring out what's the best user experience for tabs.
        }], [], [{
            label: 'Clear All Tabs',
            icon: 'i-lucide-x',
            color: 'error',
            async onSelect(e: Event) {
                await navigateTabInContext(sessionId)
                clearTabs()
            },
            disabled: !unref(isWorkspace)
        }]
    ]

    unref(tabs)?.forEach(i => {
        let node: ActiveSinglespaceFileIndex | ActiveWorkspaceFileIndex | null
        if ($sesh.isSessionWorkspace(sessionId))
            node = getWorkspaceFileByUuid(i.fileUuid)
        else
            node = getSinglespaceFileByUuid(i.fileUuid)

        if (node) {
            items[1]?.push({
                label: node.fileName,
                icon: i.changesSaved ? 'i-lucide-file-check' : 'i-lucide-file-diff',
                id: i.fileUuid,
                async toTab() {
                    await toTab(i)
                },
                async exitTab() {
                    if (i.changesSaved) {
                        if (unref(isWorkspace))
                            await exitTab(i)
                        else {
                            const sesh = $sesh.getSession(sessionId)
                            if (sesh)
                                await $aseshNavi.destroyWindowAndTryReturnToLastWindow(sesh)
                            else
                                $qt.error('Please restart your app. An error has occurred.')
                        }
                    } else {
                        $qt.warning('Saving file...')
                    }
                },
                async onSelect(e: Event) {
                    await toTab(i);
                }
            })
        }
    })

    return items
})

const panelsCollapsed = computed(() => {
    return $sesh.isSessionWorkspace(sessionId) ? unref(rightPanelCollapsed) && unref(leftPanelCollapsed) : unref(rightPanelCollapsed)
})
</script>

<template>
    <ScrollAreaRoot class="w-full relative" style="--scrollbar-size: 10px" data-tauri-drag-region>
        <div :class="`absolute transition-all duration-300 left-0 top-0 bottom-0 bg-linear-to-l from-transparent to-${panelsCollapsed ? 'default' : 'submuted'} h-full w-fit z-10 inline-flex justify-start items-center`">
            <div class="w-14"/>
            <SidebarCollapserButton side="left" v-if="isWorkspace ? leftPanelCollapsed : true" :disabled="!isWorkspace"/>
        </div>
        <ScrollAreaViewport class="grid grid-cols-1 h-full px-3">
            <div class="w-full inline-flex items-center justify-center gap-1.5" data-tauri-drag-region>
                <div
                    v-for="(tab, index) in dropdownItems[1]"
                    :class="['w-fit h-fit relative inline-flex items-center justify-center group']"
                >
                    <UButton
                        :key="index"
                        size="sm"
                        :class="['cursor-pointer transition-all duration-300', tabId == tab.id ? 'pr-8 w-fit' : 'text-muted w-24 pr-6']"
                        :color="tabId == tab.id ? 'primary' : 'neutral'"
                        :variant="tabId == tab.id ? 'subtle' : 'soft'"
                        :label="tab.label"
                        :icon="tab.icon"
                        @click="tab.toTab()"
                    />
                    <UButton icon="i-lucide-x" size="xs" color="error" variant="ghost" @click="tab.exitTab()" class="group-hover:visible invisible duration-200 transition-all absolute right-1 justify-self-center z-10"/>
                </div>
                <template v-if="tabs.length == 0">
                    <UButton variant="subtle" color="primary" size="sm" label="Empty Tab"/>
                </template>
            </div>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar
            class="select-none touch-none z-20 h-0 m-2"
            orientation="horizontal"
        >
            <ScrollAreaThumb
                class="flex-1 bg-accented rounded-lg"
            />
        </ScrollAreaScrollbar>
        <div :class="`absolute transition-all duration-300 right-0 top-0 bottom-0 bg-linear-to-r from-transparent via-${panelsCollapsed ? 'default' : 'submuted'} to-${panelsCollapsed ? 'default' : 'submuted'} h-full w-fit z-10 pl-4 inline-flex justify-end items-center gap-1`">
            <UDropdownMenu :items="dropdownItems" size="sm">
                <UButton icon="i-lucide-chevron-down" variant="ghost" size="sm"/>
            </UDropdownMenu>
            <SidebarCollapserButton side="right" v-if="rightPanelCollapsed"/>
        </div>
    </ScrollAreaRoot>
</template>

<style scoped>

</style>