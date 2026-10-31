<script setup lang="ts">
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";

const $asesh = useAppSessions()
const $recv = useAppSessionRecovery()

onMounted(async () => {
    const appSession = $asesh.getCurrentAppSession()
    if (appSession) await $recv.redirectAppSessionWindowToEditSpace(appSession)
})
</script>

<template>
    <div class="w-full min-h-screen">
        <div class="w-full min-h-screen flex flex-col gap-2 justify-center items-center">
            <div class="text-center text-muted">Loading...</div>
            <UProgress class="max-w-sm"/>
        </div>
    </div>
</template>

<style scoped>

</style>