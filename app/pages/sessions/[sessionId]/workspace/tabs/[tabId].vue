<script setup lang="ts">
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";

definePageMeta({
    layout: 'workspace'
})

const $route = useRoute()
const $tabs = useActiveTabs()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const content = ref('')

onMounted(async () => {
    if (!$tabs.isTabOpened(unref(tabId)))
        await $navi.toWorkspaceEmptyTab(unref(sessionId))
})
</script>

<template>
    <div class="w-full h-full"></div>
</template>

<style scoped>

</style>