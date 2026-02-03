<script setup lang="ts">
import type { SelectItem, ChipProps } from '@nuxt/ui'
import type { AccordionItem } from '@nuxt/ui'
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

const editorLayoutItems = [
    {
        label: 'File Tree',
        icon: 'i-lucide-folder-tree',
        slot: 'file-tree' as const
    },
    {
        label: 'Editor Panel',
        icon: 'i-lucide-panel-left-right-dashed',
        slot: 'editor-panel' as const
    },
] satisfies AccordionItem[]
</script>

<template>
    <SettingsScrollLayout title="View" v-if="config">
        <UPageCard title="Editor" description="Editor layout settings.">
            <UAccordion :items="editorLayoutItems" type="multiple">
                <template #file-tree>
                    <div class="w-full grid grid-cols-1 gap-3 pb-6 pt-3">
                        <UFormField size="sm" label="Show Extension in File Name" description="Shows the file extension in the item name label." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showFileExtInName"/>
                        </UFormField>
                        <UFormField size="sm" label="Show Extension as Tag" description="Shows the file extension as a tag at the end of the item entry." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showFileExtAsTag"/>
                        </UFormField>
                        <UFormField size="sm" label="Show File Icons" description="Shows the file item icon." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showDefaultFileIcons"/>
                        </UFormField>
                        <UFormField size="sm" label="Show Folder Icons" description="Shows the folder item icons." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showDefaultFolderIcons"/>
                        </UFormField>
                        <UFormField size="sm" label="Show Folder Fold Arrows" description="Shows the folder folding arrows on the right side." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.showFoldArrows"/>
                        </UFormField>
                        <UFormField size="sm" label="Allow Custom File Icons" description="Allow displaying custom icons shown in the entry configured in the file." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.allowCustomFileIcons"/>
                        </UFormField>
                        <UFormField size="sm" label="Allow Custom Folder Icons" description="Allow displaying custom icons shown in the entry configured in the folder." orientation="horizontal">
                            <USwitch v-model="config.viewConfig.fileTree.allowCustomFolderIcons"/>
                        </UFormField>
                    </div>
                </template>
                <template #editor-panel>
                    <div class="w-full grid grid-cols-1 gap-3 pb-6 pt-3">
                        <UFormField size="sm" label="Show Status Bar" class="capitalize" description="Display mode of the status bar." orientation="horizontal">
                            <USelect v-model="config.viewConfig.editorPanel.showStatusBar" :items="[{label: 'Show On Hover', value: 'show-on-hover'}, {label: 'Always Shown', value: 'always-shown'}, {label: 'Always Hidden', value: 'always-hidden'}]"/>
                        </UFormField>
                    </div>
                </template>
            </UAccordion>
        </UPageCard>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>