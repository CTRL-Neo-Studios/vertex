<script setup lang="ts">
import {useAppOpener} from "~/composables/app/useAppOpener";
import {getVersion} from "@tauri-apps/api/app";
import {useAppSettings} from "~/composables/app/useAppSettings.ts";

definePageMeta({
    layout: 'settings'
})
const $appConfig = useAppConfig()
const $opener = useAppOpener()
const $settings = useAppSettings()

const version = ref('')
const channel = computed(() => $settings.config.value?.updateChannel || 'stable')

onMounted(async () => {
	await $settings.load()
	try {
		version.value = await getVersion()
	} catch {
		version.value = useAppConfig().versioning.version
	}
})
</script>

<template>
    <SettingsScrollLayout :title="$t('app.settings.nav.about')">
        <div class="w-full grid grid-cols-1 gap-3">
            <UPageCard :title="`Vertex, ${version}, ${channel}`" :description="$t('app.settings.about.version')" spotlight/>
            <UPageCard @click="$opener.openUrlInBrowser('https://github.com/CTRL-Neo-Studios/vertex')" class="cursor-pointer" icon="i-lucide-github" spotlight :title="$t('app.settings.about.repo')" :description="$t('app.settings.about.repoDescription')"/>
        </div>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>
