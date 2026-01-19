<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import type {UnlistenFn} from "@tauri-apps/api/event";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $asesh = useAppSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const activeTreeItem = ref()
const $win = useAppWebviewWindows()

await until($sessionId).toMatch(v => v != undefined)

const {
    initializeIndex,
    updateIndex,
    clearIndex,
    getFileByUuid,
    addWindowCloseCallbacks
} = useActiveSinglespaceIndex($sesh.getSession($sessionId))
const {
    activeTabUuid,
    clearTabs
} = useActiveTabs($sesh.getSession($sessionId))
const {
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))
const $menu = useAppWindowMenu($asesh.getCurrentAppSession() || undefined)

let unlistenedWindows: { unlistenClose: UnlistenFn; unlistenDestroyed: UnlistenFn; } | undefined

watch(activeTabUuid, (newValue) => {
    activeTreeItem.value = newValue
}, {deep: false})

onMounted(async () => {
    if (!unref($sessionId))
        await until($sessionId).toMatch(v => v != undefined)

    const activeSesh = $sesh.getSession($sessionId)
    if (!activeSesh) {
        await $navi.toHome()
        return;
    }

    unlistenedWindows = await addWindowCloseCallbacks()
    await $menu.setMenu()
})

onBeforeUnmount(async () => {
    clearTabs()
    clearIndex()
    if (unlistenedWindows) {
        unlistenedWindows.unlistenClose()
        unlistenedWindows.unlistenDestroyed()
    }
    $sesh.removeSession($sessionId)
})

</script>

<template>
    <UDashboardGroup
        :class="['w-full h-full transition-colors duration-200', rightPanelCollapsed ? 'bg-default': 'bg-submuted']"
        unit="rem"
    >
        <slot/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>