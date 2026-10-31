<script setup lang="ts">
import {useAppOpener} from "~/composables/app/useAppOpener";

definePageMeta({
    layout: 'settings'
})
const $appConfig = useAppConfig()
const $opener = useAppOpener()
</script>

<template>
    <SettingsScrollLayout :title="$t('app.settings.nav.about')">
        <div class="w-full grid grid-cols-1 gap-3">
            <UPageCard :title="`Vertex, ${$appConfig.versioning.version}`" :description="$t('app.settings.about.version')" spotlight/>
            <UPageCard @click="$opener.openUrlInBrowser('https://github.com/CTRL-Neo-Studios/vertex')" class="cursor-pointer" icon="i-lucide-github" spotlight :title="$t('app.settings.about.repo')" :description="$t('app.settings.about.repoDescription')"/>
        </div>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>