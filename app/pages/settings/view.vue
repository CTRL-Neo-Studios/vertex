<script setup lang="ts">
import type {SelectItem} from '@nuxt/ui'
import type {AppViewConfig} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {defaultAppViewConfig} from "#shared/utils/defaults/apps";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {config, load, save} = useAppSettings()
onMounted(load)

const defaults = defaultAppViewConfig()
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

// Whole-object saves: settings merge only at the top level.
function setFileTree(patch: Partial<AppViewConfig['fileTree']>) {
    const view = config.value!.viewConfig
    return save({viewConfig: {...view, fileTree: {...view.fileTree, ...patch}}})
}

function setEditorPanel(patch: Partial<AppViewConfig['editorPanel']>) {
    const view = config.value!.viewConfig
    return save({viewConfig: {...view, editorPanel: {...view.editorPanel, ...patch}}})
}

const fileTreeDirty = computed(() => JSON.stringify(config.value?.viewConfig.fileTree) !== JSON.stringify(defaults.fileTree))
const editorPanelDirty = computed(() => JSON.stringify(config.value?.viewConfig.editorPanel) !== JSON.stringify(defaults.editorPanel))
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.view.title')" v-if="config">
        <div class="space-y-4">
            <SettingsSection :title="t('app.settings.view.fileTree')" :dirty="fileTreeDirty" @reset="setFileTree(defaults.fileTree)">
                <SettingsRow
                    v-for="row in fileTreeRows"
                    :key="row.key"
                    :label="t(`app.settings.view.${row.label}`)"
                    :description="t(`app.settings.view.${row.label}Description`)"
                >
                    <USwitch
                        :model-value="config.viewConfig.fileTree[row.key]"
                        @update:model-value="setFileTree({ [row.key]: $event })"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.view.editorPanel')" :dirty="editorPanelDirty" @reset="setEditorPanel(defaults.editorPanel)">
                <SettingsRow :label="t('app.settings.view.statusBar')" :description="t('app.settings.view.statusBarDescription')">
                    <USelect
                        :model-value="config.viewConfig.editorPanel.showStatusBar"
                        :items="statusBarItems"
                        class="w-52"
                        @update:model-value="setEditorPanel({ showStatusBar: $event as AppViewConfig['editorPanel']['showStatusBar'] })"
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
