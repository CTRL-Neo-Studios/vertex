<script setup lang="ts">
import type {SelectItem} from '@nuxt/ui'
import type {AppViewConfig} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {config, load} = useAppSettings()
const scope = useSettingsScope()
onMounted(load)

type FileTreeKey = keyof AppViewConfig['fileTree']

const fileTreeRows: {key: FileTreeKey, label: string}[] = [
    {key: 'showFileExtInName', label: 'showExtInName'},
    {key: 'showFileExtAsTag', label: 'showExtAsTag'},
    {key: 'showDefaultFileIcons', label: 'showFileIcons'},
    {key: 'showDefaultFolderIcons', label: 'showFolderIcons'},
    {key: 'showFoldArrows', label: 'showFoldArrows'},
    {key: 'allowCustomFileIcons', label: 'customFileIcons'},
    {key: 'allowCustomFolderIcons', label: 'customFolderIcons'},
]

const statusBarItems = computed<SelectItem[]>(() => [
    {label: t('app.settings.view.statusBarOnHover'), value: 'show-on-hover'},
    {label: t('app.settings.view.statusBarAlways'), value: 'always-shown'},
    {label: t('app.settings.view.statusBarNever'), value: 'always-hidden'},
])
const editorToggles = ['selectionToolbar', 'slashMenu', 'blockHandle'] as const
const editorPanelPaths = ['viewConfig.editorPanel.showStatusBar' as const, ...editorToggles.map(k => `viewConfig.editorPanel.${k}` as const)]
const fileTreePaths = fileTreeRows.map(r => `viewConfig.fileTree.${r.key}` as const)
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.view.title')" v-if="config">
        <div class="space-y-4">
            <SettingsSection :title="t('app.settings.view.fileTree')" :dirty="scope.isDirty(fileTreePaths)" @reset="scope.reset(fileTreePaths)">
                <SettingsRow
                    v-for="row in fileTreeRows"
                    :key="row.key"
                    :setting="`viewConfig.fileTree.${row.key}`"
                    :label="t(`app.settings.view.${row.label}`)"
                    :description="t(`app.settings.view.${row.label}Description`)"
                >
                    <USwitch
                        :model-value="scope.value(`viewConfig.fileTree.${row.key}`)"
                        @update:model-value="scope.set({[`viewConfig.fileTree.${row.key}`]: $event})"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :title="t('app.settings.view.editorPanel')"
                :dirty="scope.isDirty(editorPanelPaths)"
                @reset="scope.reset(editorPanelPaths)"
            >
                <SettingsRow setting="viewConfig.editorPanel.showStatusBar" :label="t('app.settings.view.statusBar')" :description="t('app.settings.view.statusBarDescription')">
                    <USelect
                        :model-value="scope.value('viewConfig.editorPanel.showStatusBar')"
                        :items="statusBarItems"
                        class="w-52"
                        @update:model-value="scope.set({'viewConfig.editorPanel.showStatusBar': $event})"
                    />
                </SettingsRow>
                <SettingsRow
                    v-for="key in editorToggles"
                    :key="key"
                    :setting="`viewConfig.editorPanel.${key}`"
                    :label="t(`app.settings.view.${key}`)"
                    :description="t(`app.settings.view.${key}Description`)"
                >
                    <USwitch
                        :model-value="scope.value(`viewConfig.editorPanel.${key}`)"
                        @update:model-value="scope.set({[`viewConfig.editorPanel.${key}`]: $event})"
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
