<script setup lang="ts">
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";

const $asesh = useAppSessions()
const $recv = useAppSessionRecovery()

onMounted(async () => {
    // If the current window is a `session-` window, saturate it
    console.log(`Getting current app session...`)
    const currentAppSession = $asesh.getCurrentAppSession()
    console.log(`Fetched app session. ${currentAppSession}`)
    if (currentAppSession) {
        await $recv.redirectAppSessionWindowToEditSpace(currentAppSession)
    }
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