<script setup lang="ts">
import type {Json} from "@type32/workflows/core"
import {baseNameOf} from "#shared/workflows/vault"

/**
 * The literal editor for Entry, File, Note and Folder inputs (Appendix A #68): the picked path, opening a
 * VaultPicker. The node checks it still exists, and is the right kind, when it runs.
 */
const props = defineProps<{
    sessionId: string,
    kind: 'file' | 'folder' | 'any',
    extensions?: string,
    value: Json | undefined,
    fallback: Json | undefined,
    update: (value: Json | undefined) => void,
}>()
const {t} = useI18n()
const open = ref(false)
const path = computed(() => (typeof props.value === 'string' ? props.value : typeof props.fallback === 'string' ? props.fallback : undefined))
const label = computed(() => path.value === undefined ? t('app.editor.ui.vaultPicker.choose')
    : path.value === '' ? t('app.editor.ui.vaultPicker.root') : baseNameOf(path.value))
const picked = computed({
    get: () => (typeof props.value === 'string' ? [props.value] : []),
    set: paths => {
        props.update(paths[0])
        open.value = false
    },
})
</script>

<template>
    <UPopover v-model:open="open">
        <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :icon="props.kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-file'"
            :label="label"
            :title="path"
            :class="['max-w-48', typeof props.value !== 'string' && 'text-dimmed']"
            :ui="{label: 'truncate'}"
        />
        <template #content>
            <div class="w-72 p-2">
                <WorkflowVaultPicker v-model="picked" :session-id="props.sessionId" :kind="props.kind" :extensions="props.extensions"/>
            </div>
        </template>
    </UPopover>
</template>
