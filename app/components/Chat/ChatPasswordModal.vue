<script setup lang="ts">
import type {FormError} from "@nuxt/ui";
import {ChatError} from "~/utils/chatClient";

/** Changes the workspace chat password through `change`; closes `true` once it's changed, `false` when dismissed. */
const props = defineProps<{ change: (current: string, next: string) => Promise<unknown> }>()
const emit = defineEmits<{ close: [boolean] }>()
const {t} = useI18n()

const state = reactive({current: '', next: '', confirm: ''})
const busy = ref(false)
const failure = ref('')

function validate(s: typeof state): FormError[] {
    const errors: FormError[] = []
    if (!s.current) errors.push({name: 'current', message: t('app.generic.required')})
    if (!s.next) errors.push({name: 'next', message: t('app.generic.required')})
    if (s.confirm !== s.next) errors.push({name: 'confirm', message: t('app.chat.vault.mismatch')})
    return errors
}

async function onSubmit() {
    busy.value = true
    failure.value = ''
    try {
        await props.change(state.current, state.next)
        emit('close', true)
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        failure.value = message === ChatError.wrongPassword ? t('app.chat.vault.wrongPassword') : message
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <UModal :close="{ onClick: () => emit('close', false) }" :title="$t('app.chat.vault.changeTitle')" size="sm">
        <template #body>
            <UForm :validate :state class="p-2 w-full flex flex-col gap-3" @submit="onSubmit">
                <UFormField :label="$t('app.chat.vault.current')" name="current" :error="failure || undefined" required>
                    <UInput v-model="state.current" type="password" class="w-full" autofocus/>
                </UFormField>
                <UFormField :label="$t('app.chat.vault.new')" name="next" required>
                    <UInput v-model="state.next" type="password" class="w-full"/>
                </UFormField>
                <UFormField :label="$t('app.chat.vault.confirm')" name="confirm" required>
                    <UInput v-model="state.confirm" type="password" class="w-full"/>
                </UFormField>
                <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="$t('app.chat.vault.noRecovery')"/>
                <UButton type="submit" block :loading="busy" :label="$t('app.chat.vault.change')"/>
            </UForm>
        </template>
    </UModal>
</template>
