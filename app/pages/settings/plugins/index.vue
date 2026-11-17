<script setup lang="ts">
import {getVersion} from "@tauri-apps/api/app";
import type {DropdownMenuItem} from "@nuxt/ui";
import {parseRequirement, validateManifest, type PluginManifest} from "#shared/plugin/manifest";
import {pluginEnabled, resolvePlugins, type OffReason} from "#shared/plugin/resolve";
import {withAt, withoutAt} from "#shared/utils/settings/paths";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useTrust} from "~/composables/app/useTrust";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {pickToOpen} from "~/utils/dialogs";
import {brokenPlugins, pluginEntries} from "~/utils/plugins/catalog";
import {pluginStates} from "~/utils/plugins/runtime";
import {stateClient} from "~/utils/stateClient";
import {vertexInvoke} from "~/utils/vertexInvoke";
import PluginInstallModal from "~/components/Modals/PluginInstallModal.vue";
import PluginRemoveModal from "~/components/Modals/PluginRemoveModal.vue";
import PluginUrlModal from "~/components/Modals/PluginUrlModal.vue";
import RestartModal from "~/components/Modals/RestartModal.vue";

definePageMeta({
    layout: 'settings'
})

/**
 * Settings → Plugins: every plugin with its switch, in the scope being edited. A workspace may turn any plugin off;
 * one it turns on that's off in the user's settings runs only once the workspace is trusted. A plugin turned off runs
 * on until Vertex restarts (its windows keep their grants till then): switching one off asks to restart, and its row
 * says it waits for one. Community plugins are installed here (Rust stages one, this page validates its manifest and
 * asks), for every workspace, and removed here.
 */
const {t} = useI18n()
const appSettings = useAppSettings()
const scope = useSettingsScope()
const trust = useTrust()
const toasts = useQuickToasts()
onMounted(appSettings.load)

const manifests = computed(() => pluginEntries().map(e => e.manifest))
const core = computed(() => pluginEntries().filter(e => e.source === 'core').map(e => e.manifest))
const community = computed(() => pluginEntries().filter(e => e.source !== 'core').map(e => e.manifest))
const nameOf = (id: string) => manifests.value.find(m => m.id === id)?.name ?? id
const enabledPath = (id: string) => `plugins.enabled.${id}` as AppSettingPath

/** The switch: this scope's own choice (a workspace's even before it applies), else the effective one, else the default. */
const isOn = (m: PluginManifest) => (scope.value(enabledPath(m.id)) as boolean | undefined) ?? m.enabledByDefault ?? true
const overlay = useOverlay()
const restartModal = overlay.create(RestartModal)
const installModal = overlay.create(PluginInstallModal)
const urlModal = overlay.create(PluginUrlModal)
const removeModal = overlay.create(PluginRemoveModal)

async function offerRestart(id: string, name: string) {
    waiting.value = await stateClient.pluginsWaitingRestart()
    if (waiting.value.includes(id) && await restartModal.open({name})) await stateClient.restart()
}

async function setOn(m: PluginManifest, on: boolean) {
    await scope.set({[enabledPath(m.id)]: on})
    if (on) waiting.value = await stateClient.pluginsWaitingRestart()
    else await offerRestart(m.id, m.name)
}

const resolution = computed(() => resolvePlugins(
    manifests.value,
    m => pluginEnabled(m, scope.effective.value?.plugins.enabled ?? {}),
    new Set(manifests.value.map(m => m.id)),
))
/** Turned on by this workspace but not running, as it isn't trusted. */
const blocked = (m: PluginManifest) => scope.root.value !== null && !scope.trusted.value && isOn(m)
    && resolution.value.off.get(m.id)?.kind === 'disabled'
const anyBlocked = computed(() => manifests.value.some(blocked))

/** Turned off somewhere but still running there; Rust has updated its grants before this window hears of a change. */
const waiting = ref<string[]>([])
watch(() => JSON.stringify(scope.effective.value?.plugins.enabled), async () => {
    waiting.value = await stateClient.pluginsWaitingRestart()
}, {immediate: true})

function reasonText(m: PluginManifest): string | undefined {
    const state = pluginStates()?.get(m.id)
    if (state?.status === 'failed') return t('app.settings.plugins.failedHere', {error: state.error})
    const reason: OffReason | undefined = resolution.value.off.get(m.id)
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
        m.author && t('app.settings.plugins.installModal.by', {author: m.author}),
        needs.length ? t('app.settings.plugins.needs', {names: needs.join(', ')}) : undefined,
        uses.length ? t('app.settings.plugins.uses', {list: uses.join(', ')}) : undefined,
    ].filter(Boolean).join(' · ')
}

/** Installs are global whatever scope is being edited: writes these paths to the user's settings. */
async function saveGlobal(patch: Record<string, unknown>) {
    const next = Object.entries(patch).reduce((s, [path, v]) => (v === undefined ? withoutAt(s, path) : withAt(s, path, v)), appSettings.config.value!)
    if (!(await appSettings.save(next))) throw new Error(t('app.settings.plugins.saveFailed'))
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const busy = ref(false)

async function install(from: 'folder' | 'zip' | 'url') {
    const source = from === 'url'
        ? await urlModal.open()
        : await pickToOpen(from === 'folder'
            ? {directory: true, title: t('app.settings.plugins.pickFolder')}
            : {title: t('app.settings.plugins.pickZip'), filters: [{name: 'Zip', extensions: ['zip']}]})
    if (!source) return
    busy.value = true
    try {
        const {stage, manifest} = await vertexInvoke<{ stage: string, manifest: unknown }>('plugin_stage', from === 'url' ? {url: source} : {path: source})
        const result = validateManifest(manifest, await getVersion())
        const errors = !result.ok ? result.errors
            : core.value.some(m => m.id === result.manifest.id) ? [t('app.settings.plugins.coreId', {id: result.manifest.id})] : []
        const replaces = result.ok ? community.value.find(m => m.id === result.manifest.id)?.version : undefined
        const accepted = await installModal.open({manifest: (manifest ?? {}) as Partial<PluginManifest>, errors, replaces})
        if (!accepted || !result.ok || errors.length) {
            await vertexInvoke('plugin_discard', {stage})
            return
        }
        const id = await vertexInvoke<string>('plugin_install', {stage})
        await saveGlobal({[`plugins.enabled.${id}`]: true, [`plugins.sources.${id}`]: source})
        toasts.success(t('app.settings.plugins.installed', {name: result.manifest.name}))
    } catch (error) {
        toasts.error(t('app.settings.plugins.installFailed'), message(error))
    } finally {
        busy.value = false
    }
}

async function remove(id: string, name: string) {
    if (!await removeModal.open({name})) return
    try {
        await vertexInvoke('plugin_remove', {id})
        await saveGlobal({[`plugins.enabled.${id}`]: undefined, [`plugins.sources.${id}`]: undefined})
        await offerRestart(id, name)
    } catch (error) {
        toasts.error(t('app.settings.plugins.removeFailed', {name}), message(error))
    }
}

const installItems = computed<DropdownMenuItem[]>(() => [
    {label: t('app.settings.plugins.installFolder'), icon: 'i-lucide-folder', onSelect: () => install('folder')},
    {label: t('app.settings.plugins.installZip'), icon: 'i-lucide-file-archive', onSelect: () => install('zip')},
    {label: t('app.settings.plugins.installUrl'), icon: 'i-lucide-link', onSelect: () => install('url')},
])
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
                :actions="[{label: t('app.settings.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                data-plugins-untrusted
            />
            <template v-for="group in [{id: 'core', list: core}, {id: 'community', list: community}]" :key="group.id">
                <SettingsSection
                    :title="t(`app.settings.plugins.${group.id}`)"
                    :description="t(`app.settings.plugins.${group.id}Description`)"
                    :data-plugins-section="group.id"
                >
                    <template v-if="group.id === 'community'" #actions>
                        <UDropdownMenu :items="installItems" :content="{align: 'end'}">
                            <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-download" :loading="busy" :label="t('app.settings.plugins.install')" data-plugins-install/>
                        </UDropdownMenu>
                    </template>
                    <p v-if="!group.list.length && (group.id === 'core' || !brokenPlugins().length)" class="text-sm text-muted px-4 py-2.5">
                        {{ t(group.id === 'core' ? 'app.settings.plugins.none' : 'app.settings.plugins.noneInstalled') }}
                    </p>
                    <SettingsRow
                        v-for="m in group.list"
                        :key="m.id"
                        :setting="enabledPath(m.id)"
                        :label="m.name"
                        :description="describe(m)"
                        :error="reasonText(m)"
                        :data-plugin-row="m.id"
                    >
                        <UBadge v-if="blocked(m)" size="sm" color="warning" variant="subtle" :label="t('app.settings.plugins.waitsForTrust')"/>
                        <UBadge v-if="waiting.includes(m.id)" size="sm" color="info" variant="subtle" :label="t('app.settings.plugins.waitsForRestart')" data-plugin-restart/>
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
                        <UTooltip v-if="group.id === 'community'" :text="t('app.settings.plugins.remove')">
                            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('app.settings.plugins.remove')" data-plugin-remove @click="remove(m.id, m.name)"/>
                        </UTooltip>
                        <USwitch :model-value="isOn(m)" :aria-label="m.name" @update:model-value="setOn(m, $event)"/>
                    </SettingsRow>
                    <template v-if="group.id === 'community'">
                        <SettingsRow
                            v-for="b in brokenPlugins()"
                            :key="b.id"
                            :label="b.name ?? b.id"
                            :error="t('app.settings.plugins.broken', {reasons: b.errors.join('; ')})"
                            :data-plugin-broken="b.id"
                        >
                            <UTooltip :text="t('app.settings.plugins.remove')">
                                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('app.settings.plugins.remove')" @click="remove(b.id, b.name ?? b.id)"/>
                            </UTooltip>
                        </SettingsRow>
                    </template>
                </SettingsSection>
            </template>
        </div>
    </SettingsScrollLayout>
</template>
