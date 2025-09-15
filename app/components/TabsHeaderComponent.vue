<script setup lang="ts">
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

const props = defineProps<{
    tabs?: ActiveTab[]
}>()

const $route = useRoute()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const {
    closeTab,
    openTab,
    activeTabUuid,
    tabs,
    getActiveTab
} = useActiveTabs($sesh.getSession(sessionId))
const {
    getFileByUuid
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))

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
</script>

<template>
    <ScrollAreaRoot class="w-full relative" style="--scrollbar-size: 10px">
        <div class="absolute left-0 top-0 bottom-0 bg-gradient-to-l from-transparent to-muted h-full w-4 z-10"/>
        <ScrollAreaViewport class="grid grid-cols-1 h-full px-3">
            <div class="w-full inline-flex items-center justify-center gap-1.5">
                <div
                    v-for="(tab, index) in unref(tabs)"
                    class="w-fit h-fit relative flex items-center justify-center group"
                >
                    <UButton
                        :key="index"
                        size="sm"
                        :class="['cursor-pointer pr-8', tabId == tab.fileUuid ? '' : 'text-muted']"
                        :color="tabId == tab.fileUuid ? 'primary' : 'neutral'"
                        :variant="tabId == tab.fileUuid ? 'subtle' : 'soft'"
                        :label="getFileByUuid(tab.fileUuid)?.fileName"
                        :icon="tab.changesSaved ? 'i-lucide-file-check' : 'i-lucide-file-diff'"
                        @click="toTab(tab)"
                    />
                    <UButton icon="i-lucide-x" size="xs" color="error" variant="ghost" @click="exitTab(tab)" class="group-hover:visible invisible duration-200 transition-all absolute right-1 justify-self-center z-10"/>
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
        <div class="absolute right-0 top-0 bottom-0 bg-gradient-to-r from-transparent to-muted h-full w-4 z-10"/>
    </ScrollAreaRoot>
</template>

<style scoped>

</style>