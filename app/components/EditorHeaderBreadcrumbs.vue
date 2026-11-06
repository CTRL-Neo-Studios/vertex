<script setup lang="ts">
import type {BreadcrumbItem, DropdownMenuItem} from '@nuxt/ui'
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

const modelValue = defineModel<string>()
const props = defineProps<{relativeFilePath: string, renaming?: boolean}>()
const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
}>()

const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {getFileByPath} = useActiveWorkspaceIndex(session)
const {effective} = useSettingsScope()

/** More crumbs than this (folders + the file) collapse to: first folder / … / file. */
const MAX_CRUMBS = 3

/** Folders on the path, with the index path each is stored under (workspace-relative paths are under the root). */
const folders = computed(() => {
    const segments = props.relativeFilePath.split('/')
    return segments.slice(0, -1).flatMap((label, i) => {
        if (!label) return [] // the empty segment before an absolute (singlespace) path's leading `/`
        const path = segments.slice(0, i + 1).join('/')
        return [{label, path: path.startsWith('/') ? path : `${session?.rootPath}/${path}`}]
    })
})

/** A folder's custom icon (its properties' `icon`), as in the file tree, when custom folder icons are allowed. */
function folderIcon(path: string) {
    const icon = effective.value?.viewConfig.fileTree.allowCustomFolderIcons ? getFileByPath(path)?.properties.icon : undefined
    return typeof icon === 'string' && icon ? icon : 'i-lucide-folder'
}

const collapsed = computed(() => folders.value.length + 1 > MAX_CRUMBS)
const hiddenFolders = computed<DropdownMenuItem[]>(() =>
    collapsed.value ? folders.value.slice(1).map(f => ({label: f.label, icon: folderIcon(f.path)})) : [])

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    const shown = collapsed.value ? folders.value.slice(0, 1) : folders.value
    return [
        ...shown.map(f => ({label: f.label})),
        ...(collapsed.value ? [{slot: 'collapsed' as const}] : []),
        {slot: 'editable' as const},
    ]
})
</script>

<template>
    <UBreadcrumb :items="breadcrumbItems" size="sm" class="text-sm select-none font-mono">
        <template #separator>
            <span class="select-none text-muted text-center align-middle">/</span>
        </template>
        <template #collapsed>
            <UDropdownMenu :items="hiddenFolders" size="sm">
                <UButton icon="i-lucide-ellipsis" size="xs" color="neutral" variant="ghost" :aria-label="$t('app.editor.ui.hiddenFolders')"/>
            </UDropdownMenu>
        </template>
        <template #editable>
            <div class="inline-flex w-fit items-center justify-center font-medium">
                <UIcon size="sm" name="i-lucide-loader-circle" class="animate-spin" v-if="props?.renaming"/>
                <TextPreviewEditField size="sm" class="w-fit" :disabled="props?.renaming" v-model="modelValue" @on-rename="(oldValue, newValue) => emit('on-rename', oldValue, newValue)"/>
            </div>
        </template>
    </UBreadcrumb>
</template>
