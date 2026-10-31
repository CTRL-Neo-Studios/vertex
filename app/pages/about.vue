<script setup lang="ts">
import {getVersion} from '@tauri-apps/api/app'
import {useAppUpdater} from '~/composables/app/useAppUpdater'
import {useAppSettings} from '~/composables/app/useAppSettings'
import {useAppOpener} from '~/composables/app/useAppOpener'

const {t} = useI18n()
const {checkForUpdates, isChecking} = useAppUpdater()
const $settings = useAppSettings()
const $opener = useAppOpener()
const REPO = 'https://github.com/CTRL-Neo-Studios/vertex'

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
    <div class="h-screen w-full flex flex-col overflow-hidden">
        <div class="shrink-0 h-(--ui-header-height)" data-tauri-drag-region/>
        <div class="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-6 text-center" data-tauri-drag-region>
            <UIcon name="i-lucide-book-open" class="size-12 text-primary"/>
            <div>
                <h1 class="text-xl font-semibold">Vertex</h1>
                <p class="text-sm text-muted">{{ t('app.about.version') }} {{ version }}</p>
            </div>
            <UBadge variant="subtle">{{ t('app.about.channel', {channel}) }}</UBadge>
            <UButton :loading="isChecking" icon="i-lucide-refresh-cw" @click="checkForUpdates">
                {{ t('app.about.checkUpdates') }}
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-github" @click="$opener.openUrlInBrowser(REPO)">
                {{ t('app.about.repo') }}
            </UButton>
        </div>
    </div>
</template>
