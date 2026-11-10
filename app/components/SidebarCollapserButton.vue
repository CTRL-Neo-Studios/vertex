<script setup lang="ts">
import type {PanelArea} from "#shared/types/app/settings";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";

/** Collapses or expands a panel area (`i-lucide-panel-left`, `-right`, `-bottom`). */
const props = withDefaults(defineProps<{
    side: PanelArea,
    disabled?: boolean
}>(), {
    disabled: false
})

const $route = useRoute()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {toggle} = usePanels($sesh.getSession($sessionId))
</script>

<template>
    <UButton :icon="`i-lucide-panel-${props.side}`" :disabled="props.disabled" variant="ghost" color="neutral" class="text-muted shrink-0" size="sm" @click="toggle(props.side)"/>
</template>

<style scoped>

</style>
