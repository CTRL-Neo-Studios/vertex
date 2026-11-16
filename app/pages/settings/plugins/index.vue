<script setup lang="ts">
import type {PluginManifest} from "#shared/plugin/manifest";
import {parseRequirement} from "#shared/plugin/manifest";
import {pluginEnabled, resolvePlugins, type OffReason} from "#shared/plugin/resolve";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useTrust} from "~/composables/app/useTrust";
import {pluginManifests} from "~/utils/plugins/catalog";

definePageMeta({
    layout: 'settings'
})

/**
 * Settings → Plugins: every plugin with its switch, in the scope being edited. A workspace may turn any plugin off;
 * one it turns on that's off in the user's settings runs only once the workspace is trusted.
 */
const {t} = useI18n()
const {load} = useAppSettings()
const scope = useSettingsScope()
const trust = useTrust()
onMounted(load)

const manifests = pluginManifests()
const nameOf = (id: string) => manifests.find(m => m.id === id)?.name ?? id
const enabledPath = (id: string) => `plugins.enabled.${id}` as AppSettingPath

/** The switch: this scope's own choice (a workspace's even before it applies), else the effective one, else the default. */
const isOn = (m: PluginManifest) => (scope.value(enabledPath(m.id)) as boolean | undefined) ?? m.enabledByDefault ?? true
const setOn = (m: PluginManifest, on: boolean) => scope.set({[enabledPath(m.id)]: on})

const resolution = computed(() => resolvePlugins(
    manifests,
    m => pluginEnabled(m, scope.effective.value?.plugins.enabled ?? {}),
    new Set(manifests.map(m => m.id)),
))
/** Turned on by this workspace but not running, as it isn't trusted. */
const blocked = (m: PluginManifest) => scope.root.value !== null && !scope.trusted.value && isOn(m)
    && resolution.value.off.get(m.id)?.kind === 'disabled'
const anyBlocked = computed(() => manifests.some(blocked))

function reasonText(reason: OffReason | undefined): string | undefined {
    switch (reason?.kind) {
        case 'missing': return t('app.settings.plugins.reason.missing', {name: reason.requirement})
        case 'requirementOff':
        case 'requirementFailed': return t('app.settings.plugins.reason.requirementOff', {name: nameOf(reason.requirement)})
        case 'cycle': return t('app.settings.plugins.reason.cycle', {names: reason.cycle.map(nameOf).join(' → ')})
    }
}

function describe(m: PluginManifest) {
    const needs = (m.requires ?? []).map(parseRequirement)
        .map(r => (r.optional ? t('app.settings.plugins.optional', {name: nameOf(r.id)}) : nameOf(r.id)))
    const uses = (m.permissions ?? []).map(p => t(`app.settings.plugins.permission.${p}`))
    return [
        m.description,
        t('app.settings.plugins.version', {version: m.version}),
        needs.length ? t('app.settings.plugins.needs', {names: needs.join(', ')}) : undefined,
        uses.length ? t('app.settings.plugins.uses', {list: uses.join(', ')}) : undefined,
    ].filter(Boolean).join(' · ')
}
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.plugins.title')">
        <div class="space-y-4">
            <UAlert
                v-if="anyBlocked"
                color="warning"
                variant="subtle"
                icon="i-lucide-shield-alert"
                :title="t('app.settings.plugins.untrusted')"
                :actions="[{label: t('app.settings.ai.features.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                data-plugins-untrusted
            />
            <SettingsSection :title="t('app.settings.plugins.core')" :description="t('app.settings.plugins.coreDescription')">
                <p v-if="!manifests.length" class="text-sm text-muted px-4 py-2.5">{{ t('app.settings.plugins.none') }}</p>
                <SettingsRow
                    v-for="m in manifests"
                    :key="m.id"
                    :setting="enabledPath(m.id)"
                    :label="m.name"
                    :description="describe(m)"
                    :error="reasonText(resolution.off.get(m.id))"
                    :data-plugin-row="m.id"
                >
                    <UBadge v-if="blocked(m)" size="sm" color="warning" variant="subtle" :label="t('app.settings.plugins.waitsForTrust')"/>
                    <UTooltip v-if="m.config?.schema?.length" :text="t('app.settings.plugins.settings')">
                        <UButton
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-settings-2"
                            :aria-label="t('app.settings.plugins.settings')"
                            :to="{path: `/settings/plugins/${m.id}`}"
                        />
                    </UTooltip>
                    <USwitch :model-value="isOn(m)" :aria-label="m.name" @update:model-value="setOn(m, $event)"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
