<script setup lang="ts">
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type { DropdownMenuItem } from '@nuxt/ui'
import {usePanels} from "~/composables/active/usePanels";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useChats} from "~/composables/ai/useChats";

const $route = useRoute()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const {t} = useI18n()
const $qt = useQuickToasts()
const {
    closeTab,
    openTab,
    activeTabUuid,
    tabs,
    getActiveTab,
    clearTabs
} = useActiveTabs($sesh.getSession(sessionId))
const {getFileByUuid} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {summary: chatSummary} = useChats($sesh.getSession(sessionId))
const panels = usePanels($sesh.getSession(sessionId))
// The left panel's header holds the switcher (and the traffic lights' room) while it shows; this one otherwise.
const leftClosed = computed(() => !panels.areas.value.left.open)
const buttons = computed(() => panels.style.value === 'buttons')
const $win = useAppWebviewWindows()

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
    const items: DropdownMenuItem[][] = [
        [{
            label: t('app.editor.ui.newTab'),
            icon: 'i-lucide-plus',
            disabled: true, // not implemented yet
        }], [], [{
            label: t('app.editor.ui.clearAllTabs'),
            icon: 'i-lucide-x',
            color: 'error',
            async onSelect() {
                await clearAllTabs()
            },
            disabled: !unref(isWorkspace)
        }]
    ]

    unref(tabs)?.forEach(i => {
        const node = getFileByUuid(i.fileUuid)
        const isChat = i.kind === 'chat'

        if (node || isChat) {
            items[1]?.push({
                label: isChat ? chatSummary(i.fileUuid).value?.title || t('app.chat.untitled') : node?.fileName,
                icon: isChat ? 'i-lucide-message-square' : i.changesSaved ? 'i-lucide-file-check' : 'i-lucide-file-diff',
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
                        else
                            // Closing a singlespace's only tab closes its window through the normal close path.
                            await $win.getCurrentAppWindow().close()
                    } else {
                        $qt.warning(t('app.editor.ui.saving'))
                    }
                },
                async onSelect() {
                    await toTab(i);
                }
            })
        }
    })

    return items
})

const firstTabItem = computed(() => unref(dropdownItems)[1]?.[0])

const scrollArea = useTemplateRef('scrollArea')

// Scroll to a specific item
function scrollToItem(index: number) {
    unref(scrollArea)?.virtualizer?.scrollToIndex(index, { align: 'center' })
}
</script>

<template>
    <!-- Equal side columns keep the tabs centred under the editor; when tabs run out of room, the sides shrink to their
    content and the tabs take the rest (and scroll). -->
    <div class="w-full h-full grid grid-cols-[1fr_minmax(0,max-content)_1fr] items-center" data-tauri-drag-region>
        <div v-if="leftClosed" class="col-start-1 h-full w-fit gap-2 z-10 inline-flex justify-start items-center px-2" data-tauri-drag-region>
            <!-- A strip already covers part of the traffic lights. -->
            <SpaceOnOs detect-os="macos" :show-on-os="true" :class="buttons ? 'w-16' : 'w-6'"/>
            <WorkspaceSwitcher/>
            <SidebarCollapserButton v-if="buttons" class="z-20" side="left" :disabled="!panels.areas.value.left.panes.length"/>
        </div>
        <UScrollArea
            ref="scrollArea"
            v-if="isWorkspace"
            class="col-start-2 no-scrollbar min-w-0 h-full relative px-2 flex items-center justify-center-safe"
            v-slot="{ item, index }: {item: DropdownMenuItem, index: number}"
            :items="dropdownItems[1]"
            orientation="horizontal"
            :virtualize="{ gap: 8 }"
			:ui="{
				item: 'flex items-center justify-center rounded'
			}"
			data-tauri-drag-region="deep"
        >
            <div v-if="tabs.length == 0" class="w-full items-center text-center">
                <span class="text-sm text-dimmed">{{ $t('app.editor.ui.selectFileShort') }}</span>
            </div>
            <div
                v-else
                :class="['rounded-md w-fit relative inline-flex items-center justify-center group transition after:absolute after:transition-all after:duration-300 ', 'h-fit', tabId == item.id ? 'after:absolute after:transition after:w-full shadow shadow-primary/20' : '']"
            >
                <UButton
                    :key="index"
                    size="sm"
                    :class="['rounded-md cursor-pointer transition-all duration-300 h-fit py-2 align-middle', 'border-none pr-8 pl-3', tabId == item.id ? 'w-fit' : 'text-muted w-fit']"
                    :color="tabId == item.id ? 'primary' : 'neutral'"
                    :variant="tabId == item.id ? 'soft' : 'ghost'"
                    :label="item.label"
                    :icon="item.icon"
                    @click="item.toTab()"
                />
                <UTooltip :text="$t('app.editor.ui.closeTab')" :kbds="['meta', 'w']">
                    <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="item?.exitTab()" class="group-hover:visible invisible duration-200 transition-all absolute right-1 justify-self-center z-10"/>
                </UTooltip>
            </div>
        </UScrollArea>
        <div v-else class="col-start-2">
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
        <div v-if="isWorkspace || (buttons && !panels.areas.value.right.open)" class="col-start-3 justify-self-end h-full w-fit z-20 px-2 inline-flex justify-end items-center gap-1" data-tauri-drag-region>
            <UDropdownMenu :items="dropdownItems" size="sm">
                <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" class="text-muted" size="sm" v-if="isWorkspace"/>
            </UDropdownMenu>
            <SidebarCollapserButton side="right" v-if="buttons && !panels.areas.value.right.open" :disabled="!panels.areas.value.right.panes.length"/>
        </div>
    </div>
</template>

<style scoped>

</style>
