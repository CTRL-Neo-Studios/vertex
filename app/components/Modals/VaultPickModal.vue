<script setup lang="ts">
import type {VaultPickOptions} from "#shared/plugin/api";

/** Pick file(s) or a folder of the workspace (`session.files.pick`, a running workflow). Closing without choosing resolves `undefined`. */
const props = withDefaults(defineProps<VaultPickOptions & { sessionId: string }>(), {extensions: ''})
const emit = defineEmits<{ close: [paths?: string[]] }>()
const {t} = useI18n()
const picked = ref<string[]>([])
</script>

<template>
    <UModal :title="props.title" :close="{ onClick: () => emit('close') }">
        <template #body>
            <VaultPicker
                v-model="picked"
                :session-id="props.sessionId"
                :kind="props.kind"
                :multiple="props.multiple"
                :extensions="props.extensions"
            />
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <span v-if="props.multiple && picked.length" class="me-auto text-sm text-muted">{{ t('app.editor.ui.vaultPicker.picked', {count: picked.length}) }}</span>
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.generic.cancel')" @click="emit('close')"/>
                <UButton size="sm" :label="t('app.editor.ui.vaultPicker.choose')" :disabled="!picked.length" @click="emit('close', picked)"/>
            </div>
        </template>
    </UModal>
</template>
