<script setup lang="ts">
import {AI_FEATURES} from "#shared/constants/ai";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useWorkflowTrust} from "~/composables/workflows/useWorkflowTrust";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {load} = useAppSettings()
const scope = useSettingsScope()
const trust = useWorkflowTrust()
onMounted(load)

const DEFAULT_PROFILE = 'aiConfig.defaultModelProfile' as const
const FEATURES = 'aiConfig.features' as const
const CHAT_STORAGE = 'aiConfig.chatStorage' as const
const CHAT_MODE = 'aiConfig.chatMode' as const
const path = (id: string) => `${FEATURES}.${id}` as AppSettingPath

// Profiles are global: the effective settings carry the global ones.
const profiles = computed(() => scope.effective.value?.aiConfig.modelProfiles ?? [])
const profileItems = computed(() => profiles.value.map(p => ({label: p.name, value: p.id})))
const defaultName = computed(() => profiles.value.find(p => p.id === scope.value(DEFAULT_PROFILE))?.name ?? '')

// Select values can't be empty: '' (stored "off") and a missing entry (default, or in a workspace: no override) get stand-ins.
const INHERIT = '@inherit'
const OFF = '@off'
const featureItems = computed(() => [
    {label: scope.root.value ? t('app.settings.scope.useGlobal') : t('app.settings.ai.features.useDefault', {name: defaultName.value}), value: INHERIT},
    {label: t('app.settings.ai.features.off'), value: OFF},
    ...profileItems.value,
])
function featureValue(id: string) {
    if (scope.root.value && !scope.overridden(path(id))) return INHERIT
    const value = scope.value(path(id)) as string | undefined
    return value === '' ? OFF : value && profiles.value.some(p => p.id === value) ? value : INHERIT
}
// A workspace's "use global" removes its override (`null`); User's "use default" removes the entry.
const setFeature = (id: string, choice: string) =>
    scope.set({[path(id)]: choice === OFF ? '' : choice === INHERIT ? (scope.root.value ? null : undefined) : choice})
const storageItems = computed(() => [
    {label: t('app.settings.ai.features.chatStorageApp'), value: 'app'},
    {label: t('app.settings.ai.features.chatStorageWorkspace'), value: 'workspace'},
])
const modeItems = computed(() => [
    {label: t('app.chat.mode.ask'), value: 'ask'},
    {label: t('app.chat.mode.suggest'), value: 'suggest'},
])

// Mirrors custom CSS: a workspace's feature choices apply only once its folder is trusted.
const featuresOff = computed(() => scope.root.value !== null && scope.overridden(FEATURES) && !scope.trusted.value)
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.ai.features.title')" v-if="scope.effective.value">
        <div class="space-y-4">
            <SettingsSection :title="t('app.settings.ai.features.defaultSection')">
                <SettingsRow :setting="DEFAULT_PROFILE" :label="t('app.settings.ai.features.defaultProfile')" :description="t('app.settings.ai.features.defaultProfileDescription')">
                    <USelect
                        class="w-56"
                        :items="profileItems"
                        :model-value="scope.value(DEFAULT_PROFILE)"
                        @update:model-value="scope.set({[DEFAULT_PROFILE]: $event})"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :title="t('app.settings.ai.features.section')"
                :description="t('app.settings.ai.features.sectionDescription')"
                :dirty="scope.isDirty([FEATURES, CHAT_STORAGE])"
                @reset="scope.reset([FEATURES, CHAT_STORAGE])"
            >
                <div v-if="featuresOff" class="px-4 py-2.5">
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
                        <USelect
                            class="w-56"
                            :items="featureItems"
                            :model-value="featureValue(feature.id)"
                            @update:model-value="setFeature(feature.id, $event as string)"
                        />
                    </SettingsRow>
                    <SettingsRow
                        v-if="feature.id === 'chat'"
                        :setting="CHAT_STORAGE"
                        :label="t('app.settings.ai.features.chatStorage')"
                        :description="t('app.settings.ai.features.chatStorageDescription')"
                    >
                        <USelect
                            class="w-56"
                            :items="storageItems"
                            :model-value="scope.value(CHAT_STORAGE)"
                            @update:model-value="scope.set({[CHAT_STORAGE]: $event})"
                        />
                    </SettingsRow>
                    <SettingsRow
                        v-if="feature.id === 'chat'"
                        :setting="CHAT_MODE"
                        :label="t('app.settings.ai.features.chatMode')"
                        :description="t('app.settings.ai.features.chatModeDescription')"
                    >
                        <USelect
                            class="w-56"
                            :items="modeItems"
                            :model-value="scope.value(CHAT_MODE)"
                            @update:model-value="scope.set({[CHAT_MODE]: $event})"
                        />
                    </SettingsRow>
                </template>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
