<script setup lang="ts">
import type { SelectItem, ChipProps, AccordionItem  } from '@nuxt/ui'
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const saving = ref(false)
const loading = ref(true)

const {
    save,
    config,
    load
} = useAppSettings()

onMounted(async () => {
    await load()
    loading.value = false
})

function saveSettings() {
    saving.value = true
    save().then(() => {
        saving.value = false
    })
}

watch(() => unref(config)?.viewConfig, () => {
    saveSettings()
}, {deep: true})

const {t} = useI18n()
const editorLayoutItems = computed(() => [
    {
        label: t('app.settings.view.fileTree'),
        icon: 'i-lucide-folder-tree',
        slot: 'file-tree' as const
    },
    {
        label: t('app.settings.view.editorPanel'),
        icon: 'i-lucide-panel-left-right-dashed',
        slot: 'editor-panel' as const
    },
] satisfies AccordionItem[])
</script>

<template>
    <SettingsScrollLayout :title="$t('app.settings.view.title')" v-if="config">
        <UPageCard :title="$t('app.settings.view.editor')" :description="$t('app.settings.view.editorDescription')">
            <UAccordion :items="editorLayoutItems" type="multiple">
                <template #file-tree>
                    <div class="w-full grid grid-cols-1 gap-3 pb-6 pt-3">
                        <UFormField size="sm" :label="$t('app.settings.view.showExtInName')" :description="$t('app.settings.view.showExtInNameDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showFileExtInName"/>
                        </UFormField>
                        <UFormField size="sm" :label="$t('app.settings.view.showExtAsTag')" :description="$t('app.settings.view.showExtAsTagDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showFileExtAsTag"/>
                        </UFormField>
                        <UFormField size="sm" :label="$t('app.settings.view.showFileIcons')" :description="$t('app.settings.view.showFileIconsDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showDefaultFileIcons"/>
                        </UFormField>
                        <UFormField size="sm" :label="$t('app.settings.view.showFolderIcons')" :description="$t('app.settings.view.showFolderIconsDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showDefaultFolderIcons"/>
                        </UFormField>
                        <UFormField size="sm" :label="$t('app.settings.view.showFoldArrows')" :description="$t('app.settings.view.showFoldArrowsDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showFoldArrows"/>
                        </UFormField>
                        <UFormField size="sm" :label="$t('app.settings.view.customFileIcons')" :description="$t('app.settings.view.customFileIconsDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.allowCustomFileIcons"/>
                        </UFormField>
                        <UFormField size="sm" :label="$t('app.settings.view.customFolderIcons')" :description="$t('app.settings.view.customFolderIconsDescription')" orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.allowCustomFolderIcons"/>
                        </UFormField>
                    </div>
                </template>
                <template #editor-panel>
                    <div class="w-full grid grid-cols-1 gap-3 pb-6 pt-3">
                        <UFormField size="sm" :label="$t('app.settings.view.statusBar')" class="capitalize" :description="$t('app.settings.view.statusBarDescription')" orientation="horizontal">
                            <USelect v-model="config.viewConfig.editorPanel.showStatusBar" :items="[{label: $t('app.settings.view.statusBarOnHover'), value: 'show-on-hover'}, {label: $t('app.settings.view.statusBarAlways'), value: 'always-shown'}, {label: $t('app.settings.view.statusBarNever'), value: 'always-hidden'}]"/>
                        </UFormField>
                    </div>
                </template>
            </UAccordion>
        </UPageCard>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>