<script setup lang="ts">
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {computed} from "vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

const $navi = useAppNavigator()
const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const {
    getSession
} = useActiveSessions()
const {
    openTab
} = useActiveTabs(getSession($sessionId))
const {
    getFileByUuid
} = useActiveWorkspaceIndex(getSession($sessionId))

async function openNewTab(uuid: string) {
    const tab = openTab(uuid)
    await $navi.toWorkspaceTab($sessionId, tab)
}
</script>

<template>
    <div class="w-full h-full select-none">
        <template v-if="$tabId && (getFileByUuid($tabId)?.backlinks.length || 0) > 0">
            <div class="flex flex-col items-center justify-start gap-1.5">
                <UTooltip :text="getFileByUuid(fid)?.relativePath" v-for="(fid, index) in getFileByUuid($tabId)?.backlinks" :key="index" :delay-duration="300">
                    <UButton @click="openNewTab(fid)" variant="soft" class="w-full" color="neutral" size="sm" :label="getFileByUuid(fid)?.fileName"/>
                </UTooltip>
            </div>
        </template>
        <template v-else>
            <div class="w-full h-full inline-flex items-center justify-center">
                <span class="text-dimmed text-xs select-none">No backlinks.</span>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>