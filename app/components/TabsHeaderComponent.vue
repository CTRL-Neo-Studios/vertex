<script setup lang="ts">
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type { DropdownMenuItem } from '@nuxt/ui'
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import type {ActiveSinglespaceFileIndex, ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";

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
const $menu = useAppWindowMenu()
const $win = useAppWebviewWindows()

const isWorkspace = computed(() => $sesh.isSessionWorkspace(sessionId))

onMounted(() => {
    // const its = unref(dropdownItems)[1]
    // if (its && its.length > 0 && unref(activeTabUuid) != null) {
    //     const index = unref(tabs).findIndex(v => v.fileUuid == unref(activeTabUuid))
    //     scrollToItem(index)
    //     console.log(`scroll to ${index}`)
    // }
})

$menu.dispatcher.on('categories.view.closeTabOrWindow', async () => {
    if (unref(tabs).length <= 0 || !unref(isWorkspace)) {
        await $win.getCurrentAppWindow().close()
    } else if (unref(tabs).length > 0 && unref(isWorkspace)) {
        const tab = getActiveTab(tabId)
        if (tab)
            await exitTab(tab)
    }
})

$menu.dispatcher.on('categories.view.clearTabs', async () => {
    await clearAllTabs()
})

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

async function clearAllTabs() {
    if (!unref(isWorkspace)) return;
    await navigateTabInContext(sessionId)
    clearTabs()
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
                await clearAllTabs()
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
                async toTab(index?: number) {
                    await toTab(i)
                    if (index)
                        scrollToItem(index)
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

const firstTabItem = computed(() => unref(dropdownItems)[1]?.[0])

const panelsCollapsed = computed(() => {
    return $sesh.isSessionWorkspace(sessionId) ? unref(rightPanelCollapsed) && unref(leftPanelCollapsed) : unref(rightPanelCollapsed)
})

const scrollArea = useTemplateRef('scrollArea')

// Scroll to a specific item
function scrollToItem(index: number) {
    unref(scrollArea)?.virtualizer?.scrollToIndex(index, { align: 'center' })
}
</script>

<template>
    <div class="w-full flex items-center">
        <div v-if="isWorkspace ? leftPanelCollapsed : true" :class="`transition-all duration-300 left-0 top-0 bottom-0 h-full w-fit gap-2 z-10 inline-flex justify-start items-center border-r border-default px-2`">
            <SpaceOnOs detect-os="macos" :show-on-os="true" class="w-16"/>
            <SidebarCollapserButton class="z-20" side="left" v-if="isWorkspace ? leftPanelCollapsed : true" :disabled="!isWorkspace"/>
        </div>
        <UScrollArea
            ref="scrollArea"
            v-if="isWorkspace"
            class="no-scrollbar w-full h-full relative"
            v-slot="{ item, index }: {item: DropdownMenuItem, index: number}"
            :items="dropdownItems[1]"
            orientation="horizontal"
            virtualize
        >
            <div v-if="tabs.length == 0" class="w-full items-center text-center">
                <span class="text-sm text-dimmed">Select a file...</span>
            </div>
            <div
                v-else
                :class="['w-fit relative inline-flex items-center justify-center group', 'h-full', tabId == item.id ? 'border-b-2 border-primary' : '']"
            >
                <UButton
                    :key="index"
                    size="sm"
                    :class="['cursor-pointer transition-all duration-300 h-full align-middle font-mono', 'rounded-none pr-8', tabId == item.id ? 'w-fit' : 'text-muted w-fit']"
                    :color="tabId == item.id ? 'primary' : 'neutral'"
                    :variant="tabId == item.id ? 'soft' : 'ghost'"
                    :label="item.label"
                    :icon="item.icon"
                    @click="item.toTab()"
                />
                <UTooltip text="Close Tab" :kbds="['meta', 'w']">
                    <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="item?.exitTab()" class="group-hover:visible invisible duration-200 transition-all absolute right-1 justify-self-center z-10"/>
                </UTooltip>
            </div>
        </UScrollArea>
        <div v-else class="grow">
            <div class="absolute top-2 left-1/2 -translate-x-1/2">
                <UDashboardSearchButton
                    :kbs="['meta', 'p']"
                    variant="subtle"
                    :label="firstTabItem?.label"
                    :icon="firstTabItem?.icon"
                    size="sm"
                />
            </div>
        </div>
<!--        <ScrollAreaRoot v-if="isWorkspace" class="w-full relative h-full" style="&#45;&#45;scrollbar-size: 10px" data-tauri-drag-region>-->
<!--            <ScrollAreaViewport class="grid grid-cols-1 h-full">-->

<!--            </ScrollAreaViewport>-->
<!--            <ScrollAreaScrollbar-->
<!--                class="select-none touch-none z-20 h-0 m-2"-->
<!--                orientation="horizontal"-->
<!--            >-->
<!--                <ScrollAreaThumb-->
<!--                    class="flex-1 bg-accented rounded-lg"-->
<!--                />-->
<!--            </ScrollAreaScrollbar>-->
<!--        </ScrollAreaRoot>-->
        <div v-if="isWorkspace ? true : rightPanelCollapsed" :class="`transition-all duration-300 right-0 top-0 bottom-0 h-full w-fit z-20 px-2 border-l border-default inline-flex justify-end items-center gap-1`">
            <UDropdownMenu :items="dropdownItems" size="sm">
                <UButton icon="i-lucide-chevron-down" variant="ghost" size="sm" v-if="isWorkspace"/>
            </UDropdownMenu>
            <SidebarCollapserButton side="right" v-if="rightPanelCollapsed"/>
        </div>
    </div>
</template>

<style scoped>

</style>