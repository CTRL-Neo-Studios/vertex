<script setup lang="ts">
import {useAppOpener} from "~/composables/app/useAppOpener";

definePageMeta({
    layout: 'settings'
})
const $appConfig = useAppConfig()
const $opener = useAppOpener()
</script>

<template>
    <SettingsScrollLayout title="About">
        <div class="w-full grid grid-cols-1 gap-3">
            <UPageCard :title="`Vertex, ${$appConfig.versioning.version}`" description="The app's current version." spotlight/>
            <UPageCard @click="$opener.openUrlInBrowser('https://github.com/CTRL-Neo-Studios/vertex')" class="cursor-pointer" icon="i-lucide-github" spotlight :title="`GitHub Repository`" description="The app's open-source source code on GitHub."/>
        </div>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>