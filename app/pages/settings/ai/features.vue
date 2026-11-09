<script setup lang="ts">
import {AI_FEATURES} from "#shared/constants/ai";
import {Routes} from "#shared/constants/app";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useWorkflowTrust} from "~/composables/workflows/useWorkflowTrust";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {load, config} = useAppSettings()
const scope = useSettingsScope()
const trust = useWorkflowTrust()
onMounted(load)

const ENABLED = 'aiConfig.enabled' as const
const DEFAULT_PROFILE = 'aiConfig.defaultModelProfile' as const
const FEATURES = 'aiConfig.features' as const
const CHAT_STORAGE = 'aiConfig.chatStorage' as const
const CHAT_MODE = 'aiConfig.chatMode' as const
const CHAT_TITLES = 'aiConfig.chatTitles' as const
const ENTRIES = 'aiConfig.editorAssistant' as const
const ENTRY_KEYS = ['toolbar', 'slash', 'shortcut'] as const
const path = (id: string) => `${FEATURES}.${id}` as AppSettingPath

// Profiles are global: the effective settings carry the global ones. Each shows its provider and model.
const profiles = computed(() => scope.effective.value?.aiConfig.modelProfiles ?? [])
const profileItems = computed(() => profiles.value.map(p => ({
    label: p.name,
    value: p.id,
    description: [scope.effective.value?.aiConfig.providers.find(x => x.id === p.providerId)?.name, p.modelId].filter(Boolean).join(' · ') || undefined,
})))
const defaultName = computed(() => profiles.value.find(p => p.id === scope.value(DEFAULT_PROFILE))?.name ?? '')
const MODELS = `${Routes.settings}/ai/models`
/** The profile a feature uses now (its own, else the default), for its Edit link. */
function profileOf(id: string) {
    const ai = scope.effective.value?.aiConfig
    return profiles.value.find(p => p.id === ai?.features[id])?.id ?? ai?.defaultModelProfile
}

const aiOn = computed(() => scope.value(ENABLED))

// Select values can't be empty: a missing entry (default, or in a workspace: no override) gets a stand-in. Off (`''`)
// is the switch beside it.
const INHERIT = '@inherit'
const featureItems = computed(() => [
    {label: scope.root.value ? t('app.settings.scope.useGlobal') : t('app.settings.ai.features.useDefault', {name: defaultName.value}), value: INHERIT},
    ...profileItems.value,
])
const featureOn = (id: string) => scope.value(path(id)) !== ''
function featureValue(id: string) {
    if (scope.root.value && !scope.overridden(path(id))) return INHERIT
    const value = scope.value(path(id)) as string | undefined
    return value && profiles.value.some(p => p.id === value) ? value : INHERIT
}
// A workspace's "use global" removes its override (`null`); User's "use default" removes the entry.
const setFeature = (id: string, choice: string) =>
    scope.set({[path(id)]: choice === INHERIT ? (scope.root.value ? null : undefined) : choice})
/** Off stores `''`. On goes back to the default; in a workspace whose global choice is off, that takes an override. */
function setFeatureOn(id: string, on: boolean) {
    if (!on) return scope.set({[path(id)]: ''})
    if (scope.root.value && config.value?.aiConfig.features[id] === '') return scope.set({[path(id)]: scope.value(DEFAULT_PROFILE)})
    return setFeature(id, INHERIT)
}
const storageItems = computed(() => [
    {label: t('app.settings.ai.features.chatStorageApp'), value: 'app'},
    {label: t('app.settings.ai.features.chatStorageWorkspace'), value: 'workspace'},
])
const modeItems = computed(() => [
    {label: t('app.chat.mode.read'), value: 'read'},
    {label: t('app.chat.mode.suggest'), value: 'suggest'},
    {label: t('app.chat.mode.write'), value: 'write'},
])

// Mirrors custom CSS: a workspace's AI switch and feature choices apply only once its folder is trusted.
const untrusted = computed(() => scope.root.value !== null && (scope.overridden(FEATURES) || scope.overridden(ENABLED)) && !scope.trusted.value)
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.ai.features.title')" v-if="scope.effective.value">
        <div class="space-y-4">
            <SettingsSection :title="t('app.settings.ai.features.masterSection')" :dirty="scope.isDirty([ENABLED])" @reset="scope.reset([ENABLED])">
                <SettingsRow :setting="ENABLED" :label="t('app.settings.ai.features.enabled')" :description="t('app.settings.ai.features.enabledDescription')">
                    <USwitch :model-value="aiOn" @update:model-value="scope.set({[ENABLED]: $event})"/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.ai.features.defaultSection')" :class="!aiOn && 'opacity-50'">
                <SettingsRow :setting="DEFAULT_PROFILE" :label="t('app.settings.ai.features.defaultProfile')" :description="t('app.settings.ai.features.defaultProfileDescription')">
                    <USelectMenu
                        class="w-56"
                        :items="profileItems"
                        value-key="value"
                        :filter-fields="['label', 'description']"
                        :search-input="{placeholder: t('app.chat.profileSearch')}"
                        :disabled="!aiOn"
                        :model-value="scope.value(DEFAULT_PROFILE)"
                        @update:model-value="scope.set({[DEFAULT_PROFILE]: $event})"
                    />
                    <UTooltip :text="t('app.settings.ai.features.editProfile')">
                        <UButton :to="`${MODELS}/${scope.value(DEFAULT_PROFILE)}`" size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t('app.settings.ai.features.editProfile')"/>
                    </UTooltip>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :class="!aiOn && 'opacity-50'"
                :title="t('app.settings.ai.features.section')"
                :description="t('app.settings.ai.features.sectionDescription')"
                :dirty="scope.isDirty([FEATURES, ENTRIES, CHAT_STORAGE, CHAT_MODE, CHAT_TITLES])"
                @reset="scope.reset([FEATURES, ENTRIES, CHAT_STORAGE, CHAT_MODE, CHAT_TITLES])"
            >
                <div v-if="untrusted" class="px-4 py-2.5">
                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-shield-alert"
                        :title="t('app.settings.ai.features.untrusted')"
                        :actions="[{label: t('app.settings.ai.features.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                    />
                </div>
                <template v-for="feature in AI_FEATURES" :key="feature.id">
                    <SettingsRow
                        :setting="path(feature.id)"
                        :label="t(feature.label)"
                        :description="t(feature.description)"
                    >
                        <USelectMenu
                            class="w-56"
                            :items="featureItems"
                            value-key="value"
                            :filter-fields="['label', 'description']"
                            :search-input="{placeholder: t('app.chat.profileSearch')}"
                            :disabled="!aiOn || !featureOn(feature.id)"
                            :model-value="featureValue(feature.id)"
                            @update:model-value="setFeature(feature.id, $event as string)"
                        />
                        <UTooltip :text="t('app.settings.ai.features.editProfile')">
                            <UButton :to="`${MODELS}/${profileOf(feature.id)}`" size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t('app.settings.ai.features.editProfile')"/>
                        </UTooltip>
                        <USwitch
                            :disabled="!aiOn"
                            :aria-label="t(feature.label)"
                            :model-value="featureOn(feature.id)"
                            @update:model-value="setFeatureOn(feature.id, $event)"
                        />
                    </SettingsRow>
                    <template v-if="feature.id === 'editorAssistant'">
                        <SettingsRow
                            v-for="key in ENTRY_KEYS"
                            :key
                            :setting="`${ENTRIES}.${key}`"
                            :label="t(`app.settings.ai.features.entry.${key}`)"
                            :description="t(`app.settings.ai.features.entry.${key}Description`)"
                        >
                            <USwitch
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="scope.value(`${ENTRIES}.${key}`)"
                                @update:model-value="scope.set({[`${ENTRIES}.${key}`]: $event})"
                            />
                        </SettingsRow>
                    </template>
                    <template v-if="feature.id === 'chat'">
                        <SettingsRow :setting="CHAT_TITLES" :label="t('app.settings.ai.features.chatTitles')" :description="t('app.settings.ai.features.chatTitlesDescription')">
                            <USwitch
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="scope.value(CHAT_TITLES)"
                                @update:model-value="scope.set({[CHAT_TITLES]: $event})"
                            />
                        </SettingsRow>
                        <SettingsRow :setting="CHAT_STORAGE" :label="t('app.settings.ai.features.chatStorage')" :description="t('app.settings.ai.features.chatStorageDescription')">
                            <USelect
                                class="w-56"
                                :items="storageItems"
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="scope.value(CHAT_STORAGE)"
                                @update:model-value="scope.set({[CHAT_STORAGE]: $event})"
                            />
                        </SettingsRow>
                        <SettingsRow :setting="CHAT_MODE" :label="t('app.settings.ai.features.chatMode')" :description="t('app.settings.ai.features.chatModeDescription')">
                            <USelect
                                class="w-56"
                                :items="modeItems"
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="scope.value(CHAT_MODE)"
                                @update:model-value="scope.set({[CHAT_MODE]: $event})"
                            />
                        </SettingsRow>
                    </template>
                </template>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
