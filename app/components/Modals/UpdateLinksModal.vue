<script setup lang="ts">
/** `canRemember`: offer to keep the answer for this workspace (`fileConfig.updateLinks`); workspaces only. */
const props = defineProps<{
    fileName: string,
    referencingFiles: string[],
    linkCount: number,
    canRemember?: boolean,
}>()
const emit = defineEmits<{ close: [{ update: boolean, remember: boolean }] }>()
const {t} = useI18n()
const remember = ref(false)
const answer = (update: boolean) => emit('close', {update, remember: remember.value})
</script>

<template>
    <UModal
        :title="t('app.editor.ui.updateLinks.title', {name: props.fileName})"
        :description="t('app.editor.ui.updateLinks.description', {links: props.linkCount, files: props.referencingFiles.length})"
        :close="{ onClick: () => emit('close', {update: false, remember: false}) }"
        size="sm"
    >
        <template #body>
            <ul class="text-sm text-muted space-y-1 max-h-48 overflow-y-auto">
                <li v-for="f in props.referencingFiles" :key="f" class="truncate font-mono text-xs">{{ f }}</li>
            </ul>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UCheckbox v-if="props.canRemember" v-model="remember" :label="t('app.editor.ui.updateLinks.remember')" class="me-auto"/>
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.editor.ui.updateLinks.keep')" @click="answer(false)"/>
                <UButton size="sm" color="primary" :label="t('app.editor.ui.updateLinks.update')" autofocus @click="answer(true)"/>
            </div>
        </template>
    </UModal>
</template>
