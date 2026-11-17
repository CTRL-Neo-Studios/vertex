<script setup lang="ts">
import type {FormError} from "@nuxt/ui";
import {ChatError} from "../lib/client";
import {chatSession} from "../plugin";
import {useChats} from "../lib/chats";

/** Sets the workspace chat password (vault `none`) or unlocks it (`locked`). */
const {t} = useI18n()
const chats = useChats(chatSession()!)
const creating = computed(() => chats.vault.value === 'none')

const state = reactive({password: '', confirm: '', remember: false})
const busy = ref(false)
const failure = ref('')

function validate(s: typeof state): FormError[] {
    const errors: FormError[] = []
    if (!s.password) errors.push({name: 'password', message: t('app.generic.required')})
    if (creating.value && s.confirm !== s.password) errors.push({name: 'confirm', message: t('plugins.chat.vault.mismatch')})
    return errors
}

async function onSubmit() {
    busy.value = true
    failure.value = ''
    try {
        if (creating.value) await chats.createVault(state.password, state.remember)
        else await chats.unlock(state.password, state.remember)
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        failure.value = message === ChatError.wrongPassword ? t('plugins.chat.vault.wrongPassword') : message
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <UForm :validate :state class="w-full max-w-sm mx-auto flex flex-col gap-3 p-3" @submit="onSubmit">
        <div class="flex flex-col items-center gap-1 text-center">
            <UIcon :name="creating ? 'i-lucide-shield-plus' : 'i-lucide-lock'" class="size-6 text-muted"/>
            <span class="text-sm font-medium text-highlighted">{{ creating ? $t('plugins.chat.vault.createTitle') : $t('plugins.chat.vault.unlockTitle') }}</span>
            <span class="text-xs text-muted">{{ creating ? $t('plugins.chat.vault.createDescription') : $t('plugins.chat.vault.unlockDescription') }}</span>
        </div>
        <UFormField :label="$t('plugins.chat.vault.password')" name="password" :error="failure || undefined">
            <UInput v-model="state.password" type="password" class="w-full" autofocus/>
        </UFormField>
        <UFormField v-if="creating" :label="$t('plugins.chat.vault.confirm')" name="confirm">
            <UInput v-model="state.confirm" type="password" class="w-full"/>
        </UFormField>
        <UAlert v-if="creating" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="$t('plugins.chat.vault.noRecovery')"/>
        <UCheckbox v-model="state.remember" :label="$t('plugins.chat.vault.remember')"/>
        <UButton type="submit" block :loading="busy" :label="creating ? $t('plugins.chat.vault.create') : $t('plugins.chat.vault.unlock')"/>
    </UForm>
</template>
