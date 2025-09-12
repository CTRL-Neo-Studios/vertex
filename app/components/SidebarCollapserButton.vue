<script setup lang="ts">
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveSessions} from "~/composables/active/useActiveSessions";

const props = defineProps<{
    side: "left" | "right"
}>()

const $route = useRoute()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    leftPanelCollapsed,
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))

function toggleSidebar() {
    if(props.side == "left")
        leftPanelCollapsed.value = !leftPanelCollapsed.value
    else
        rightPanelCollapsed.value = !rightPanelCollapsed.value
}
</script>

<template>
    <UButton :icon="`i-lucide-panel-${props.side}`" variant="ghost" size="sm" @click="toggleSidebar"/>
</template>

<style scoped>

</style>