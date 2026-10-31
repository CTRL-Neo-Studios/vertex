<script setup lang="ts">
const props = defineProps<{
    fileName: string,
    referencingFiles: string[],
    linkCount: number,
}>()
const emit = defineEmits<{ close: [boolean] }>()
const {t} = useI18n()
</script>

<template>
    <UModal
        :title="t('app.editor.ui.updateLinks.title', {name: props.fileName})"
        :description="t('app.editor.ui.updateLinks.description', {links: props.linkCount, files: props.referencingFiles.length})"
        :close="{ onClick: () => emit('close', false) }"
        size="sm"
    >
        <template #body>
            <ul class="text-sm text-muted space-y-1 max-h-48 overflow-y-auto">
                <li v-for="f in props.referencingFiles" :key="f" class="truncate font-mono text-xs">{{ f }}</li>
            </ul>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.editor.ui.updateLinks.keep')" @click="emit('close', false)"/>
                <UButton size="sm" color="primary" :label="t('app.editor.ui.updateLinks.update')" autofocus @click="emit('close', true)"/>
            </div>
        </template>
    </UModal>
</template>
