<script setup lang="ts">
import type {SelectItem} from '@nuxt/ui'
import type {AppViewConfig, PanelLayout} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import PanelArrangement from "~/components/Settings/PanelArrangement.vue";
import {platform} from "@tauri-apps/plugin-os";

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
const updateLinksItems = computed<SelectItem[]>(() => [
    {label: t('app.settings.view.updateLinksAsk'), value: 'ask'},
    {label: t('app.settings.view.updateLinksUpdate'), value: 'update'},
    {label: t('app.settings.view.updateLinksKeep'), value: 'keep'},
])
const importToChatItems = computed<SelectItem[]>(() => [
    {label: t('app.settings.view.importToChatAsk'), value: 'ask'},
    {label: t('app.settings.view.importToChatAlways'), value: 'always'},
])
const deletedFilesItems = computed<SelectItem[]>(() => [
    {label: t('app.settings.view.deletedFilesTrash'), value: 'trash'},
    {label: t('app.settings.view.deletedFilesWorkspace'), value: 'workspaceTrash'},
    {label: t('app.settings.view.deletedFilesPermanent'), value: 'permanent'},
])
const filePaths = ['fileConfig.updateLinks' as const, 'fileConfig.deletedFiles' as const, 'fileConfig.attachmentsFolder' as const, 'fileConfig.importToChat' as const]
/** A folder path as typed: no leading or trailing slashes; empty means the top level. */
const folderPath = (event: Event) => (event.target as HTMLInputElement).value.trim().replace(/^\/+|\/+$/g, '')
const editorToggles = ['selectionToolbar', 'slashMenu', 'blockHandle'] as const
const headerTools = ['headerHistory', 'headerFormatting'] as const
const headerToolsItems = computed<SelectItem[]>(() => [
    {label: t('app.settings.view.headerToolsLeft'), value: 'left'},
    {label: t('app.settings.view.headerToolsRight'), value: 'right'},
    {label: t('app.settings.view.headerToolsHidden'), value: 'hidden'},
])
const editorPanelPaths = [
    'viewConfig.editorPanel.showStatusBar' as const,
    ...[...editorToggles, ...headerTools].map(k => `viewConfig.editorPanel.${k}` as const),
]
const fileTreePaths = fileTreeRows.map(r => `viewConfig.fileTree.${r.key}` as const)

const mod = platform() === 'macos' ? '⌘' : 'Ctrl'
const canvasOption = (key: string) => t(`app.settings.view.canvasOptions.${key}`, {mod})
const canvasSelects = computed(() => [
    {key: 'wheelBehavior' as const, items: [{label: canvasOption('wheelPan'), value: 'pan'}, {label: canvasOption('wheelZoom'), value: 'zoom'}]},
    {key: 'modDragBehavior' as const, items: ['menu', 'card', 'file', 'media', 'webpage', 'group'].map(value => ({label: canvasOption(`modDrag.${value}`), value}))},
    {key: 'cardLabels' as const, items: ['always', 'hover', 'never'].map(value => ({label: canvasOption(`cardLabel.${value}`), value}))},
] satisfies {key: string, items: SelectItem[]}[])
const canvasToggles = ['snapToGrid', 'snapToObjects'] as const
const canvasPaths = (['wheelBehavior', 'modDragBehavior', 'cardLabels', ...canvasToggles, 'zoomBreakpoint'] as const).map(k => `viewConfig.canvas.${k}` as const)

const panelStyleItems = computed<SelectItem[]>(() => [
    {label: t('app.settings.view.panelStyleButtons'), value: 'buttons'},
    {label: t('app.settings.view.panelStyleStrip'), value: 'strip'},
])
const layoutPaths = ['viewConfig.panels.left', 'viewConfig.panels.right', 'viewConfig.panels.bottom', 'viewConfig.panels.hidden'] as const
const panelPaths = ['viewConfig.panels.style' as const, ...layoutPaths]
const panelLayout = computed<PanelLayout>(() => ({
    left: scope.value('viewConfig.panels.left'),
    right: scope.value('viewConfig.panels.right'),
    bottom: scope.value('viewConfig.panels.bottom'),
    hidden: scope.value('viewConfig.panels.hidden'),
}))
const setLayout = (next: PanelLayout) => scope.set({[layoutPaths[0]]: next.left, [layoutPaths[1]]: next.right, [layoutPaths[2]]: next.bottom, [layoutPaths[3]]: next.hidden})
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

            <SettingsSection :title="t('app.settings.view.files')" :dirty="scope.isDirty(filePaths)" @reset="scope.reset(filePaths)">
                <SettingsRow setting="fileConfig.updateLinks" :label="t('app.settings.view.updateLinks')" :description="t('app.settings.view.updateLinksDescription')">
                    <USelect
                        :model-value="scope.value('fileConfig.updateLinks')"
                        :items="updateLinksItems"
                        class="w-52"
                        @update:model-value="scope.set({'fileConfig.updateLinks': $event})"
                    />
                </SettingsRow>
                <SettingsRow setting="fileConfig.deletedFiles" :label="t('app.settings.view.deletedFiles')" :description="t('app.settings.view.deletedFilesDescription')">
                    <USelect
                        :model-value="scope.value('fileConfig.deletedFiles')"
                        :items="deletedFilesItems"
                        class="w-52"
                        @update:model-value="scope.set({'fileConfig.deletedFiles': $event})"
                    />
                </SettingsRow>
                <SettingsRow setting="fileConfig.attachmentsFolder" :label="t('app.settings.view.attachmentsFolder')" :description="t('app.settings.view.attachmentsFolderDescription')">
                    <UInput
                        :model-value="scope.value('fileConfig.attachmentsFolder')"
                        :placeholder="t('app.settings.view.attachmentsFolderTop')"
                        class="w-52"
                        @change="scope.set({'fileConfig.attachmentsFolder': folderPath($event)})"
                    />
                </SettingsRow>
                <SettingsRow setting="fileConfig.importToChat" :label="t('app.settings.view.importToChat')" :description="t('app.settings.view.importToChatDescription')">
                    <USelect
                        :model-value="scope.value('fileConfig.importToChat')"
                        :items="importToChatItems"
                        class="w-52"
                        @update:model-value="scope.set({'fileConfig.importToChat': $event})"
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
                <SettingsRow
                    v-for="key in headerTools"
                    :key="key"
                    :setting="`viewConfig.editorPanel.${key}`"
                    :label="t(`app.settings.view.${key}`)"
                    :description="t(`app.settings.view.${key}Description`)"
                >
                    <USelect
                        :model-value="scope.value(`viewConfig.editorPanel.${key}`)"
                        :items="headerToolsItems"
                        class="w-52"
                        @update:model-value="scope.set({[`viewConfig.editorPanel.${key}`]: $event})"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.view.canvas')" :dirty="scope.isDirty(canvasPaths)" @reset="scope.reset(canvasPaths)">
                <SettingsRow
                    v-for="row in canvasSelects"
                    :key="row.key"
                    :setting="`viewConfig.canvas.${row.key}`"
                    :label="canvasOption(row.key)"
                    :description="canvasOption(`${row.key}Description`)"
                >
                    <USelect
                        :model-value="scope.value(`viewConfig.canvas.${row.key}`)"
                        :items="row.items"
                        class="w-52"
                        @update:model-value="scope.set({[`viewConfig.canvas.${row.key}`]: $event})"
                    />
                </SettingsRow>
                <SettingsRow
                    v-for="key in canvasToggles"
                    :key="key"
                    :setting="`viewConfig.canvas.${key}`"
                    :label="canvasOption(key)"
                    :description="canvasOption(`${key}Description`)"
                >
                    <USwitch
                        :model-value="scope.value(`viewConfig.canvas.${key}`)"
                        @update:model-value="scope.set({[`viewConfig.canvas.${key}`]: $event})"
                    />
                </SettingsRow>
                <SettingsRow setting="viewConfig.canvas.zoomBreakpoint" :label="canvasOption('zoomBreakpoint')" :description="canvasOption('zoomBreakpointDescription')">
                    <USlider
                        :model-value="scope.value('viewConfig.canvas.zoomBreakpoint')"
                        :min="-2"
                        :max="2"
                        :step="0.25"
                        class="w-52"
                        tooltip
                        @update:model-value="scope.set({'viewConfig.canvas.zoomBreakpoint': $event})"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :title="t('app.settings.view.panels')"
                :description="t('app.settings.view.panelsDescription')"
                :dirty="scope.isDirty(panelPaths)"
                @reset="scope.reset(panelPaths)"
            >
                <SettingsRow setting="viewConfig.panels.style" :label="t('app.settings.view.panelStyle')" :description="t('app.settings.view.panelStyleDescription')">
                    <USelect
                        :model-value="scope.value('viewConfig.panels.style')"
                        :items="panelStyleItems"
                        class="w-52"
                        @update:model-value="scope.set({'viewConfig.panels.style': $event})"
                    />
                </SettingsRow>
                <SettingsRow setting="viewConfig.panels.left" :label="t('app.settings.view.panelLayout')" :description="t('app.settings.view.panelLayoutDescription')"/>
                <PanelArrangement
                    class="px-4 pb-4"
                    :layout="panelLayout"
                    @update="setLayout"
                    @reset="scope.reset([...layoutPaths])"
                />
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
