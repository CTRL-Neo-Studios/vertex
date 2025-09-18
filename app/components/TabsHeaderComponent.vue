<script setup lang="ts">
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type { DropdownMenuItem } from '@nuxt/ui'
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";

const $route = useRoute()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const {
    closeTab,
    openTab,
    activeTabUuid,
    tabs,
    getActiveTab,
    clearTabs
} = useActiveTabs($sesh.getSession(sessionId))
const {
    getFileByUuid
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    leftPanelCollapsed,
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession(sessionId))

async function toTab(tab: ActiveTab) {
    openTab(tab.fileUuid)
    await $navi.toWorkspaceTab(sessionId, tab)
}
async function exitTab(tab: ActiveTab) {
    closeTab(tab.fileUuid)
    if (unref(tabs).length == 0)
        await $navi.toWorkspaceEmptyTab(sessionId)
    else {
        const uuid = unref(activeTabUuid)
        if (!uuid) {
            await $navi.toWorkspaceEmptyTab(sessionId)
            return;
        }

        const activeTab = getActiveTab(uuid)
        if (activeTab) {
            await $navi.toWorkspaceTab(sessionId, activeTab)
            return;
        }

        await $navi.toWorkspaceEmptyTab(sessionId)
        return;
    }
}

const dropdownItems = computed<DropdownMenuItem[][]>(() => {
    const items: DropdownMenuItem[][] = [[]]
    unref(tabs)?.forEach(i => {
        const node = getFileByUuid(i.fileUuid)
        if(node) {
            items[0]?.push({
                label: node.fileName,
                icon: i.changesSaved ? 'i-lucide-file-check' : 'i-lucide-file-diff',
                id: i.fileUuid,
                async toTab() {
                    await toTab(i)
                },
                async exitTab() {
                    await exitTab(i)
                },
                async onSelect(e: Event) {
                    await toTab(i);
                }
            })
        }
    })

    items.push([
        {
            label: 'Clear All Tabs',
            icon: 'i-lucide-x',
            color: 'error',
            async onSelect(e: Event) {
                await $navi.toWorkspaceEmptyTab(sessionId)
                clearTabs()
            }
        }
    ])
    return items
})
</script>

<template>
    <ScrollAreaRoot class="w-full relative" style="--scrollbar-size: 10px">
        <div :class="`absolute transition-all duration-300 left-0 top-0 bottom-0 bg-gradient-to-l from-transparent to-${rightPanelCollapsed && leftPanelCollapsed ? 'default' : 'submuted'} h-full w-fit z-10 inline-flex justify-start items-center`">
            <div class="w-14"/>
            <SidebarCollapserButton side="left" v-if="leftPanelCollapsed"/>
        </div>
        <ScrollAreaViewport class="grid grid-cols-1 h-full px-3">
            <div class="w-full inline-flex items-center justify-center gap-1.5">
                <div
                    v-for="(tab, index) in dropdownItems[0]"
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
                <template v-if="unref(tabs).length == 0">
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
        <div :class="`absolute transition-all duration-300 right-0 top-0 bottom-0 bg-gradient-to-r from-transparent via-${rightPanelCollapsed && leftPanelCollapsed ? 'default' : 'submuted'} to-${rightPanelCollapsed && leftPanelCollapsed ? 'default' : 'submuted'} h-full w-fit z-10 pl-4 inline-flex justify-end items-center gap-1`">
            <UDropdownMenu :items="dropdownItems" size="sm">
                <UButton icon="i-lucide-chevron-down" variant="ghost" size="sm"/>
            </UDropdownMenu>
            <SidebarCollapserButton side="right" v-if="rightPanelCollapsed"/>
        </div>
    </ScrollAreaRoot>
</template>

<style scoped>

</style>