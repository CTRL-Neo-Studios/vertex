<script setup lang="ts">
import type {SelectItem} from '@nuxt/ui'
import type {SessionRecoveryMode} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {updaterClient, type UpdateChannel} from "~/composables/app/useAppUpdater";

definePageMeta({
    layout: 'settings'
})

const {t, locales} = useI18n()
const {config, load, save} = useAppSettings()

onMounted(async () => {
    await load()
    hasToken.value = !!(await updaterClient.getToken().catch(() => null))
    await loadChannels()
})

const recoveryItems = computed<SelectItem[]>(() => (['none', 'workspaces', 'singlespaces', 'both'] as SessionRecoveryMode[])
    .map(value => ({value, label: t(`app.settings.general.recovery.${value}`)})))

// Language names are shown in their own language so they are recognisable whatever is selected.
const languageItems = computed<SelectItem[]>(() => [
    {value: 'system', label: t('app.settings.general.language.system')},
    ...locales.value.map(l => (typeof l === 'string' ? {value: l, label: l} : {value: l.code, label: l.name ?? l.code})),
])

async function setRecovery(value: SessionRecoveryMode) {
    await save({recoverSessions: value})
}

async function setLanguage(value: string) {
    await save({language: value})
}

// Channels come from the update server: public ones plus restricted ones the saved token grants.
const channels = ref<UpdateChannel[]>([])
const channelsLoading = ref(false)
const channelsError = ref<string>()
const channelItems = computed<SelectItem[]>(() => {
    const items: SelectItem[] = channels.value.map(c => ({
        value: c.name,
        label: c.name,
        icon: c.access === 'restricted' ? 'i-lucide-lock' : undefined,
    }))
    const current = config.value?.updateChannel
    if (current && !channels.value.some(c => c.name === current)) items.unshift({value: current, label: current})
    return items
})

async function loadChannels() {
    channelsLoading.value = true
    channelsError.value = undefined
    try {
        channels.value = await updaterClient.listChannels()
        // A channel the server no longer offers (e.g. token removed) would fail every check.
        const current = config.value?.updateChannel
        if (current && !channels.value.some(c => c.name === current)) await save({updateChannel: 'stable'})
    } catch (error) {
        channelsError.value = t('app.settings.updates.channel.loadFailed', {error: String(error)})
    } finally {
        channelsLoading.value = false
    }
}

async function setUpdateChannel(value: string) {
    await save({updateChannel: value})
}

// The token is write-only from the UI: it is stored in the OS keychain and never shown again.
const hasToken = ref(false)
const tokenDraft = ref('')
const tokenError = ref<string>()

async function setToken(token: string) {
    tokenError.value = undefined
    try {
        await updaterClient.setToken(token)
        hasToken.value = !!token.trim()
        tokenDraft.value = ''
        await loadChannels()
    } catch (error) {
        tokenError.value = String(error)
    }
}
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.general.title')" v-if="config">
        <UPageCard :title="t('app.settings.general.startup')">
            <UFormField
                size="sm"
                :label="t('app.settings.general.recovery.label')"
                :description="t('app.settings.general.recovery.description')"
                orientation="horizontal"
            >
                <USelect
                    :model-value="config.recoverSessions"
                    :items="recoveryItems"
                    class="min-w-44"
                    @update:model-value="setRecovery($event as SessionRecoveryMode)"
                />
            </UFormField>
        </UPageCard>
        <UPageCard :title="t('app.settings.general.language.title')">
            <UFormField
                size="sm"
                :label="t('app.settings.general.language.label')"
                :description="t('app.settings.general.language.description')"
                orientation="horizontal"
            >
                <USelect
                    :model-value="config.language"
                    :items="languageItems"
                    class="min-w-44"
                    @update:model-value="setLanguage($event as string)"
                />
            </UFormField>
        </UPageCard>
        <UPageCard :title="t('app.settings.updates.title')">
            <UFormField
                size="sm"
                :label="t('app.settings.updates.channel.label')"
                :description="t('app.settings.updates.channel.description')"
                orientation="horizontal"
            >
                <USelect
                    :model-value="config.updateChannel"
                    :items="channelItems"
                    :loading="channelsLoading"
                    class="min-w-44"
                    @update:model-value="setUpdateChannel($event as string)"
                />
            </UFormField>
            <p v-if="channelsError" class="text-xs text-error mt-1">{{ channelsError }}</p>
            <UFormField
                size="sm"
                :label="t('app.settings.updates.token.label')"
                :description="t(hasToken ? 'app.settings.updates.token.saved' : 'app.settings.updates.token.description')"
                :error="tokenError"
                orientation="horizontal"
            >
                <UButton v-if="hasToken" color="neutral" variant="outline" icon="i-lucide-trash-2" @click="setToken('')">
                    {{ t('app.settings.updates.token.remove') }}
                </UButton>
                <UFieldGroup v-else>
                    <UInput v-model="tokenDraft" type="password" class="min-w-44" @keydown.enter="setToken(tokenDraft)"/>
                    <UButton color="neutral" variant="outline" :disabled="!tokenDraft.trim()" @click="setToken(tokenDraft)">
                        {{ t('app.settings.updates.token.save') }}
                    </UButton>
                </UFieldGroup>
            </UFormField>
        </UPageCard>
    </SettingsScrollLayout>
</template>
