<script setup lang="ts">
/** Asked once per run, before its first move to `.vertex/trash` (Settings → Workflows can turn it off). */
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ close: [boolean] }>()
const {t} = useI18n()
</script>

<template>
    <UModal
        :title="t('app.editor.ui.workflowTrash.title')"
        :description="t('app.editor.ui.workflowTrash.description', {name: props.name})"
        :close="{ onClick: () => emit('close', false) }"
        size="sm"
    >
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.editor.ui.workflowTrash.cancel')" @click="emit('close', false)"/>
                <UButton size="sm" color="error" icon="i-lucide-trash-2" :label="t('app.editor.ui.workflowTrash.confirm')" autofocus @click="emit('close', true)"/>
            </div>
        </template>
    </UModal>
</template>
