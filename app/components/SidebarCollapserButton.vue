<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";

const props = withDefaults(defineProps<{
    side: "left" | "right",
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
