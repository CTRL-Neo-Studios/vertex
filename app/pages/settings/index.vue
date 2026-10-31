<script setup lang="ts">
import {getVersion} from "@tauri-apps/api/app";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useAppUpdater} from "~/composables/app/useAppUpdater";

definePageMeta({
    layout: 'settings'
})

const REPO = 'https://github.com/CTRL-Neo-Studios/vertex'
const $opener = useAppOpener()
const $settings = useAppSettings()
const {checkForUpdates, isChecking} = useAppUpdater()

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
        <SettingsSection title="Vertex">
            <SettingsRow :label="$t('app.about.version')" :description="$t('app.settings.about.version')">
                <span class="font-mono text-sm text-highlighted">{{ version }}</span>
                <UBadge variant="subtle" color="neutral">{{ channel }}</UBadge>
            </SettingsRow>
            <SettingsRow :label="$t('app.settings.updates.title')" :description="$t('app.about.channel', { channel })">
                <UButton :loading="isChecking" icon="i-lucide-refresh-cw" color="neutral" variant="outline" @click="checkForUpdates">
                    {{ $t('app.about.checkUpdates') }}
                </UButton>
            </SettingsRow>
            <SettingsRow :label="$t('app.settings.about.repo')" :description="$t('app.settings.about.repoDescription')">
                <UButton icon="i-lucide-github" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-up-right" @click="$opener.openUrlInBrowser(REPO)">
                    GitHub
                </UButton>
            </SettingsRow>
        </SettingsSection>
    </SettingsScrollLayout>
</template>
