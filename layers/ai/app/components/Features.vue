<script setup lang="ts">
import type {ScopedConfig} from "#shared/plugin/api";
import {SettingsRow, SettingsScrollLayout, SettingsSection} from "~/plugin/ui";
import {aiConfigOf} from "../../shared/config";
import {features} from "../lib/features";
import {aiContext} from "../plugin";

/**
 * Settings → Assistive AI → Features, in the scope being edited: AI's switch, the default profile, and each registered
 * feature's profile with its switch. Chat's, the editor assistant's and git's options sit under their features until
 * those plugins take them.
 */
const props = defineProps<{ config: ScopedConfig }>()
const {t} = useI18n()
const getAt = (object: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], object)
const ctx = aiContext()

const ENABLED = 'enabled'
const DEFAULT_PROFILE = 'defaultModelProfile'
const FEATURES = 'features'
const CHAT_STORAGE = 'chatStorage'
const CHAT_MODE = 'chatMode'
const CHAT_TITLES = 'chatTitles'
const ENTRIES = 'editorAssistant'
const ENTRY_KEYS = ['toolbar', 'slash', 'shortcut'] as const
const COMMIT_MESSAGES = 'commitMessages'
const COMMIT_KEYS = ['whenEmpty', 'autoSync'] as const
const path = (id: string) => `${FEATURES}.${id}`
/** What each key is when nothing sets it: what Reset puts back in User. */
const DEFAULTS = aiConfigOf({enabled: true}) as unknown as Record<string, unknown>

/** The config in effect in this scope, checked and defaulted. */
const effective = computed(() => aiConfigOf(props.config.effective))
/** This scope's own value (a workspace's even before it applies), else the effective one. */
const current = (key: string) => (props.config.overridden(key) ? props.config.value(key) : getAt(effective.value, key))
const set = (key: string, value: unknown) => props.config.set({[key]: value})

// Profiles are global: the effective config carries the global ones. Each shows its provider and model.
const profiles = computed(() => effective.value.modelProfiles)
const profileItems = computed(() => profiles.value.map(p => ({
    label: p.name,
    value: p.id,
    description: [effective.value.providers.find(x => x.id === p.providerId)?.name, p.modelId].filter(Boolean).join(' · ') || undefined,
})))
const defaultName = computed(() => profiles.value.find(p => p.id === current(DEFAULT_PROFILE))?.name ?? '')
const MODELS = '/settings/ai/models'
/** The profile a feature uses now (its own, else the default), for its Edit link. */
const profileOf = (id: string) => profiles.value.find(p => p.id === effective.value.features[id])?.id ?? effective.value.defaultModelProfile

const aiOn = computed(() => current(ENABLED) !== false)

// Select values can't be empty: a missing entry (default, or in a workspace: no override) gets a stand-in. Off (`''`)
// is the switch beside it.
const INHERIT = '@inherit'
const featureItems = computed(() => [
    {label: props.config.root ? t('plugins.ai.useGlobal') : t('plugins.ai.features.useDefault', {name: defaultName.value}), value: INHERIT},
    ...profileItems.value,
])
const featureOn = (id: string) => current(path(id)) !== ''
function featureValue(id: string) {
    if (props.config.root && !props.config.overridden(path(id))) return INHERIT
    const value = current(path(id)) as string | undefined
    return value && profiles.value.some(p => p.id === value) ? value : INHERIT
}
// A workspace's "use global" removes its override (`null`); User's "use default" removes the entry.
const setFeature = (id: string, choice: string) =>
    set(path(id), choice === INHERIT ? (props.config.root ? null : undefined) : choice)
/** Off stores `''`. On goes back to the default; in a workspace whose global choice is off, that takes an override. */
function setFeatureOn(id: string, on: boolean) {
    if (!on) return set(path(id), '')
    if (props.config.root && aiConfigOf(ctx.config.value).features[id] === '') return set(path(id), current(DEFAULT_PROFILE))
    return setFeature(id, INHERIT)
}
const storageItems = computed(() => [
    {label: t('plugins.ai.features.chatStorageApp'), value: 'app'},
    {label: t('plugins.ai.features.chatStorageWorkspace'), value: 'workspace'},
])
const modeItems = computed(() => [
    {label: t('plugins.ai.features.chatModes.read'), value: 'read'},
    {label: t('plugins.ai.features.chatModes.suggest'), value: 'suggest'},
    {label: t('plugins.ai.features.chatModes.write'), value: 'write'},
])

// Mirrors custom CSS: a workspace's AI switch and feature choices apply only once its folder is trusted.
const untrusted = computed(() => props.config.root !== null && (props.config.overridden(FEATURES) || props.config.overridden(ENABLED)) && !props.config.trusted)
const featureKeys = [FEATURES, ENTRIES, CHAT_STORAGE, CHAT_MODE, CHAT_TITLES]
</script>

<template>
    <SettingsScrollLayout :title="t('plugins.ai.features.title')">
        <div class="space-y-4">
            <SettingsSection :title="t('plugins.ai.features.masterSection')" :dirty="config.isDirty([ENABLED], DEFAULTS)" @reset="config.reset([ENABLED], DEFAULTS)">
                <SettingsRow :setting="config.path(ENABLED)" :label="t('plugins.ai.features.enabled')" :description="t('plugins.ai.features.enabledDescription')">
                    <USwitch :model-value="aiOn" @update:model-value="set(ENABLED, $event)"/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('plugins.ai.features.defaultSection')" :class="!aiOn && 'opacity-50'">
                <SettingsRow :setting="config.path(DEFAULT_PROFILE)" :label="t('plugins.ai.features.defaultProfile')" :description="t('plugins.ai.features.defaultProfileDescription')">
                    <USelectMenu
                        class="w-56"
                        :items="profileItems"
                        value-key="value"
                        :filter-fields="['label', 'description']"
                        :search-input="{placeholder: t('plugins.ai.profileSearch')}"
                        :disabled="!aiOn"
                        :model-value="current(DEFAULT_PROFILE) as string"
                        @update:model-value="set(DEFAULT_PROFILE, $event)"
                    />
                    <UTooltip :text="t('plugins.ai.features.editProfile')">
                        <UButton :to="`${MODELS}/${current(DEFAULT_PROFILE)}`" size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t('plugins.ai.features.editProfile')"/>
                    </UTooltip>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :class="!aiOn && 'opacity-50'"
                :title="t('plugins.ai.features.section')"
                :description="t('plugins.ai.features.sectionDescription')"
                :dirty="config.isDirty(featureKeys, DEFAULTS)"
                @reset="config.reset(featureKeys, DEFAULTS)"
            >
                <div v-if="untrusted" class="px-4 py-2.5">
                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-shield-alert"
                        :title="t('plugins.ai.features.untrusted')"
                        :actions="[{label: t('plugins.ai.features.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => ctx.trust.trustFolder(config.root!, true)}]"
                    />
                </div>
                <template v-for="feature in features" :key="feature.id">
                    <SettingsRow
                        :setting="config.path(path(feature.id))"
                        :label="t(feature.label)"
                        :description="t(feature.description)"
                    >
                        <USelectMenu
                            class="w-56"
                            :items="featureItems"
                            value-key="value"
                            :filter-fields="['label', 'description']"
                            :search-input="{placeholder: t('plugins.ai.profileSearch')}"
                            :disabled="!aiOn || !featureOn(feature.id)"
                            :model-value="featureValue(feature.id)"
                            @update:model-value="setFeature(feature.id, $event as string)"
                        />
                        <UTooltip :text="t('plugins.ai.features.editProfile')">
                            <UButton :to="`${MODELS}/${profileOf(feature.id)}`" size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t('plugins.ai.features.editProfile')"/>
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
                            :setting="config.path(`${ENTRIES}.${key}`)"
                            :label="t(`plugins.ai.features.entry.${key}`)"
                            :description="t(`plugins.ai.features.entry.${key}Description`)"
                        >
                            <USwitch
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="current(`${ENTRIES}.${key}`) as boolean"
                                @update:model-value="set(`${ENTRIES}.${key}`, $event)"
                            />
                        </SettingsRow>
                    </template>
                    <template v-if="feature.id === 'chat'">
                        <SettingsRow :setting="config.path(CHAT_TITLES)" :label="t('plugins.ai.features.chatTitles')" :description="t('plugins.ai.features.chatTitlesDescription')">
                            <USwitch
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="current(CHAT_TITLES) as boolean"
                                @update:model-value="set(CHAT_TITLES, $event)"
                            />
                        </SettingsRow>
                        <SettingsRow :setting="config.path(CHAT_STORAGE)" :label="t('plugins.ai.features.chatStorage')" :description="t('plugins.ai.features.chatStorageDescription')">
                            <USelect
                                class="w-56"
                                :items="storageItems"
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="current(CHAT_STORAGE) as string"
                                @update:model-value="set(CHAT_STORAGE, $event)"
                            />
                        </SettingsRow>
                        <SettingsRow :setting="config.path(CHAT_MODE)" :label="t('plugins.ai.features.chatMode')" :description="t('plugins.ai.features.chatModeDescription')">
                            <USelect
                                class="w-56"
                                :items="modeItems"
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="current(CHAT_MODE) as string"
                                @update:model-value="set(CHAT_MODE, $event)"
                            />
                        </SettingsRow>
                    </template>
                    <template v-if="feature.id === 'commitMessage'">
                        <SettingsRow
                            v-for="key in COMMIT_KEYS"
                            :key
                            :setting="config.path(`${COMMIT_MESSAGES}.${key}`)"
                            :label="t(`plugins.ai.features.commitMessages.${key}`)"
                            :description="t(`plugins.ai.features.commitMessages.${key}Description`)"
                        >
                            <USwitch
                                :disabled="!aiOn || !featureOn(feature.id)"
                                :model-value="current(`${COMMIT_MESSAGES}.${key}`) as boolean"
                                @update:model-value="set(`${COMMIT_MESSAGES}.${key}`, $event)"
                            />
                        </SettingsRow>
                    </template>
                </template>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
