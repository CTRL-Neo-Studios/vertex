<script setup lang="ts">
/**
 * Files from outside dropped or pasted into chat: chat attaches workspace files, so they're copied into `folder` first.
 * `canRemember`: offer to stop asking in this workspace (`fileConfig.importToChat`); workspaces only.
 */
const props = defineProps<{ count: number, folder: string, canRemember?: boolean }>()
const emit = defineEmits<{ close: [{ add: boolean, remember: boolean }] }>()
const {t} = useI18n()
const remember = ref(false)
const answer = (add: boolean) => emit('close', {add, remember: add && remember.value})
</script>

<template>
    <UModal
        :title="t('app.chat.importDialog.title', {count: props.count})"
        :description="t('app.chat.importDialog.description', {folder: props.folder})"
        :close="{ onClick: () => answer(false) }"
        size="sm"
    >
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UCheckbox v-if="props.canRemember" v-model="remember" :label="t('app.editor.ui.updateLinks.remember')" class="me-auto"/>
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.generic.cancel')" @click="answer(false)"/>
                <UButton size="sm" color="primary" :label="t('app.chat.importDialog.add')" autofocus @click="answer(true)"/>
            </div>
        </template>
    </UModal>
</template>
