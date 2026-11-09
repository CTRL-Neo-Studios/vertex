<script setup lang="ts">
import type {FormError, FormSubmitEvent} from "@nuxt/ui";

/** Asks for a chat title or folder name; closes with the trimmed value, or `false` when dismissed. */
const props = defineProps<{ modalTitle: string, label: string, value?: string, folder?: boolean }>()
const emit = defineEmits<{ close: [string | false] }>()
const {t} = useI18n()

const state = reactive({name: props.value ?? ''})

function validate(s: typeof state): FormError[] {
    const name = s.name.trim()
    if (!name) return [{name: 'name', message: t('app.generic.required')}]
    if (props.folder && name.includes('/')) return [{name: 'name', message: t('app.chat.invalidFolderName')}]
    return []
}

function onSubmit(event: FormSubmitEvent<typeof state>) {
    emit('close', event.data.name.trim())
}
</script>

<template>
    <UModal :close="{ onClick: () => emit('close', false) }" :title="modalTitle" size="sm">
        <template #body>
            <UForm :validate :state class="p-2 w-full" @submit="onSubmit">
                <UFormField :label name="name" required>
                    <UInput v-model="state.name" class="w-full" autofocus/>
                </UFormField>
            </UForm>
        </template>
    </UModal>
</template>
