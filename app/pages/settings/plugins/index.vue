<script setup lang="ts">
import {getVersion} from "@tauri-apps/api/app";
import {listen} from "@tauri-apps/api/event";
import type {DropdownMenuItem} from "@nuxt/ui";
import {parseRequirement, validateManifest, type PluginManifest} from "#shared/plugin/manifest";
import {pluginEnabled, resolvePlugins, type OffReason} from "#shared/plugin/resolve";
import {withAt, withoutAt} from "#shared/utils/settings/paths";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useTrust} from "~/composables/app/useTrust";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {openUrlInBrowser} from "~/composables/app/useAppOpener";
import {pickToOpen} from "~/utils/dialogs";
import {Routes} from "#shared/constants/app";
import {brokenPlugins, installedOrigin, missingPlugins, pluginEntries, workspacePlugins, type InstallRecord, type WorkspacePlugin} from "~/utils/plugins/catalog";
import {describeOrigin, originUrl, shareableSource} from "~/utils/plugins/origin";
import {contributionPlugin, pluginStates} from "~/utils/plugins/runtime";
import {settingsPages} from "~/utils/contributions";
import {PLUGIN_ICON, pluginSettingsRoute} from "~/utils/settingsNav";
import {stateClient} from "~/utils/stateClient";
import {vertexInvoke} from "~/utils/vertexInvoke";
import PluginGitModal from "~/components/Modals/PluginGitModal.vue";
import PluginInstallModal, {type InstallTarget} from "~/components/Modals/PluginInstallModal.vue";
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
 * says it waits for one. Community plugins are installed here, for every workspace or (editing a trusted one) for that
 * workspace, from a Git repository (or a `.zip`, or a folder while developing one): Rust stages one, this page
 * validates its manifest and asks. Their updates are checked when asked (or daily, when the user turns that on) and
 * installed only through the same dialog. Editing a workspace also lists its own plugins (accepted or not) and those
 * it turns on that this device lacks.
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
/** Where a plugin's gear goes: its nav entry (`pluginSettingsRoute`). */
const settingsOf = (m: PluginManifest) =>
    pluginSettingsRoute(m.id, [...settingsPages.items.values()].map(def => ({def, owner: contributionPlugin(def)})), m, Routes.settings)
const enabledPath = (id: string) => `plugins.enabled.${id}` as AppSettingPath

/** The switch: this scope's own choice (a workspace's even before it applies), else the effective one, else the default. */
const isOn = (m: PluginManifest) => (scope.value(enabledPath(m.id)) as boolean | undefined) ?? m.enabledByDefault ?? true
const overlay = useOverlay()
const restartModal = overlay.create(RestartModal)
const installModal = overlay.create(PluginInstallModal)
const urlModal = overlay.create(PluginUrlModal)
const gitModal = overlay.create(PluginGitModal)
const removeModal = overlay.create(PluginRemoveModal)

async function offerRestart(id: string, name: string) {
    waiting.value = await stateClient.pluginsWaitingRestart()
    if (waiting.value.includes(id) && await restartModal.open({name})) await stateClient.restart()
}

async function setOn(m: PluginManifest, on: boolean) {
    // A workspace that turns a community plugin on says where it came from, for its other devices.
    const source = on && scope.root.value ? sourceOf(m.id) : undefined
    await scope.set({[enabledPath(m.id)]: on, ...(shareableSource(source) ? {[sourcePath(m.id)]: source} : {})})
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
const sourcePath = (id: string) => `plugins.sources.${id}` as AppSettingPath

/** The edited workspace's own plugins (accepted or not), and what it turns on that this device has nowhere. */
const own = computed(() => (scope.root.value ? workspacePlugins() : []))
const ownCopy = (id: string) => own.value.find(p => p.listed.id === id)
const missing = computed(() => (scope.root.value ? missingPlugins(scope.local.value.plugins?.enabled) : []))
/** Where a plugin came from: the edited workspace's copy's record, else the installed one's, else what the workspace says. */
const sourceOf = (id: string) => ownCopy(id)?.listed.record?.source ?? installedOrigin(id)?.record?.source
    ?? (scope.local.value.plugins?.sources as Record<string, string> | undefined)?.[id]
const workspaceName = computed(() => scope.root.value?.split(/[\\/]/).filter(Boolean).pop() ?? '')

interface Staged {
    stage: string
    manifest: unknown
    resolved: InstallRecord
    installed: InstallRecord | null
    workspaceInstalled: InstallRecord | null
    claimed: string | null
}

/**
 * Stages `what` (a source string, or a picked path), validates its manifest, asks, and installs it on: for every
 * workspace, or into the edited workspace when it's trusted and the user picks it (`target` preselects).
 */
async function stageAndInstall(what: { source: string } | { path: string }, target: InstallTarget = 'global') {
    busy.value = true
    const root = scope.root.value && scope.trusted.value ? scope.root.value : null
    try {
        const {stage, manifest, resolved, installed, workspaceInstalled, claimed} = await vertexInvoke<Staged>('plugin_stage', {...what, root})
        const result = validateManifest(manifest, await getVersion())
        const errors = !result.ok ? result.errors
            : core.value.some(m => m.id === result.manifest.id) ? [t('app.settings.plugins.coreId', {id: result.manifest.id})] : []
        const id = result.ok ? result.manifest.id : undefined
        const where = await installModal.open({
            manifest: (manifest ?? {}) as Partial<PluginManifest>,
            errors,
            resolved,
            claimed,
            global: {current: community.value.find(m => m.id === id), installed},
            workspace: root ? {name: workspaceName.value, current: ownCopy(id ?? '')?.manifest, installed: workspaceInstalled} : undefined,
            target: root ? target : 'global',
        })
        if (!where || !result.ok || errors.length) {
            await vertexInvoke('plugin_discard', {stage})
            return
        }
        const inWorkspace = where === 'workspace' && root
        const replaced = inWorkspace ? !!ownCopy(result.manifest.id) : community.value.some(m => m.id === result.manifest.id)
        const done = await vertexInvoke<{ id: string, source: string }>('plugin_install', {stage, root: inWorkspace ? root : null})
        if (inWorkspace) await scope.set({[enabledPath(done.id)]: true, ...(shareableSource(done.source) ? {[sourcePath(done.id)]: done.source} : {})})
        else await saveGlobal({[enabledPath(done.id)]: true, [sourcePath(done.id)]: done.source})
        updates.value = updates.value.filter(u => u.id !== done.id || u.root !== (inWorkspace ? root : null))
        toasts.success(t(replaced ? 'app.settings.plugins.updated' : 'app.settings.plugins.installed', {name: result.manifest.name}))
    } catch (error) {
        toasts.error(t('app.settings.plugins.installFailed'), message(error))
    } finally {
        busy.value = false
    }
}

async function install(from: 'git' | 'folder' | 'zip' | 'url', link?: string) {
    if (from === 'git' || from === 'url') {
        const source = from === 'git' ? await gitModal.open({link}) : await urlModal.open()
        if (source) await stageAndInstall({source})
        return
    }
    const path = await pickToOpen(from === 'folder'
        ? {directory: true, title: t('app.settings.plugins.pickFolder')}
        : {title: t('app.settings.plugins.pickZip'), filters: [{name: 'Zip', extensions: ['zip']}]})
    if (path) await stageAndInstall({path})
}

/** Removes a plugin: the installed one, or with `inWorkspace` the edited workspace's copy (and that workspace's choice for it). */
async function remove(id: string, name: string, inWorkspace = false) {
    if (!await removeModal.open({name})) return
    try {
        await vertexInvoke('plugin_remove', {id, root: inWorkspace ? scope.root.value : null})
        if (inWorkspace) await scope.set({[enabledPath(id)]: null, [sourcePath(id)]: null})
        else await saveGlobal({[enabledPath(id)]: undefined, [sourcePath(id)]: undefined})
        await offerRestart(id, name)
    } catch (error) {
        toasts.error(t('app.settings.plugins.removeFailed', {name}), message(error))
    }
}

/** Accepts the edited workspace's plugins that aren't (new, or changed since), after the trust dialog lists them. */
async function accept(plugins: readonly WorkspacePlugin[]) {
    if (scope.root.value) await trust.acceptPlugins(scope.root.value, plugins)
}

const otherWays = computed<DropdownMenuItem[]>(() => [
    {label: t('app.settings.plugins.installZip'), icon: 'i-lucide-file-archive', onSelect: () => install('zip')},
    {label: t('app.settings.plugins.installUrl'), icon: 'i-lucide-link', onSelect: () => install('url')},
    {label: t('app.settings.plugins.installFolder'), icon: 'i-lucide-folder-code', onSelect: () => install('folder')},
])

/** A plugin whose source has something newer (Rust's `plugin_updates`); `root`: a workspace's copy. */
interface Update {
    id: string
    root: string | null
    source: string
    installed: InstallRecord
    available: InstallRecord
}

/** The last check's updates: opening this page asks nobody; Check for updates asks each plugin's source. */
const updates = ref<Update[]>([])
const checking = ref(false)
const updateOf = (id: string, root: string | null = null) => updates.value.find(u => u.id === id && u.root === root)
const updateLabel = (u: Update) => t('app.settings.plugins.updateTo', {to: u.available.name ?? u.available.commit?.slice(0, 7) ?? ''})
let unlisten: (() => void) | undefined
onMounted(async () => {
    updates.value = await vertexInvoke<Update[]>('plugin_updates', {check: false})
    unlisten = await listen<Update[]>('vertex://plugin-updates', e => (updates.value = e.payload))
})
onBeforeUnmount(() => unlisten?.())

async function checkUpdates() {
    checking.value = true
    try {
        updates.value = await vertexInvoke<Update[]>('plugin_updates', {check: true, root: scope.root.value})
        if (!updates.value.length) toasts.success(t('app.settings.plugins.upToDate'))
    } catch (error) {
        toasts.error(t('app.settings.plugins.checkFailed'), message(error))
    } finally {
        checking.value = false
    }
}

const checkAutomatically = computed({
    get: () => appSettings.config.value?.plugins.checkUpdates ?? false,
    set: on => void saveGlobal({'plugins.checkUpdates': on}).catch(error => toasts.error(t('app.settings.plugins.saveFailed'), message(error))),
})

/**
 * A plugin's origin line, and whether to offer its repository as its source (it names one it wasn't fetched from).
 * `unknown`: what to say without a record (installed before records; put in a workspace by hand or by sync).
 */
function originOf(origin: { record: InstallRecord | null, claimed: string | null } | undefined, unknown = 'app.settings.plugins.origin.unknown') {
    const record = origin?.record
    return {
        text: record ? describeOrigin(record, t) : t(unknown),
        url: record ? originUrl(record) : undefined,
        claim: origin?.claimed && origin.claimed !== record?.origin ? origin.claimed : undefined,
    }
}
const globalOrigin = (id: string) => originOf(installedOrigin(id))

/** The edited workspace's plugin's row: its description and origin, and where it stands. */
function ownRow(p: WorkspacePlugin) {
    const origin = originOf(p.listed, 'app.settings.plugins.origin.copied')
    const state = p.errors.length ? t('app.settings.plugins.broken', {reasons: p.errors.join('; ')})
        : !scope.trusted.value ? undefined
            : !p.listed.accepted ? t('app.settings.plugins.notAccepted') : undefined
    return {
        name: p.manifest?.name ?? p.listed.id,
        description: [p.manifest && describe(p.manifest), origin.text, origin.claim && t('app.settings.plugins.origin.claims', {origin: origin.claim})].filter(Boolean).join(' · '),
        state,
        origin,
    }
}
const pending = computed(() => own.value.filter(p => p.manifest && !p.listed.accepted))
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
                    :info="group.id === 'community' ? t('app.settings.plugins.communityInfo') : undefined"
                    :empty="!group.list.length && (group.id === 'core' || !brokenPlugins().length) ? t(group.id === 'core' ? 'app.settings.plugins.none' : 'app.settings.plugins.noneInstalled') : undefined"
                    :data-plugins-section="group.id"
                >
                    <template v-if="group.id === 'community'" #actions>
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="checking" :label="t('app.settings.plugins.checkUpdates')" data-plugins-check @click="checkUpdates"/>
                        <UFieldGroup size="xs">
                            <UButton color="neutral" variant="outline" icon="i-lucide-git-branch" :loading="busy" :label="t('app.settings.plugins.install')" data-plugins-install @click="install('git')"/>
                            <UDropdownMenu :items="otherWays" :content="{align: 'end'}">
                                <UButton color="neutral" variant="outline" icon="i-lucide-chevron-down" :aria-label="t('app.settings.plugins.installOther')" data-plugins-install-other/>
                            </UDropdownMenu>
                        </UFieldGroup>
                    </template>
                    <SettingsRow
                        v-for="m in group.list"
                        :key="m.id"
                        :setting="enabledPath(m.id)"
                        :label="m.name"
                        :icon="m.icon ?? PLUGIN_ICON"
                        :description="group.id === 'community' ? [describe(m), globalOrigin(m.id).text, globalOrigin(m.id).claim && t('app.settings.plugins.origin.claims', {origin: globalOrigin(m.id).claim})].filter(Boolean).join(' · ') : describe(m)"
                        :error="reasonText(m)"
                        :data-plugin-row="m.id"
                    >
                        <UBadge v-if="blocked(m)" size="sm" color="warning" variant="subtle" :label="t('app.settings.plugins.waitsForTrust')"/>
                        <UBadge v-if="waiting.includes(m.id)" size="sm" color="info" variant="subtle" :label="t('app.settings.plugins.waitsForRestart')" data-plugin-restart/>
                        <template v-if="group.id === 'community'">
                            <UBadge v-if="ownCopy(m.id)" size="sm" color="neutral" variant="subtle" :label="t('app.settings.plugins.ownCopyHere')"/>
                            <UButton
                                v-if="updateOf(m.id)"
                                size="xs"
                                icon="i-lucide-arrow-up-circle"
                                :loading="busy"
                                :label="updateLabel(updateOf(m.id)!)"
                                data-plugin-update
                                @click="stageAndInstall({source: updateOf(m.id)!.source})"
                            />
                            <UButton
                                v-if="globalOrigin(m.id).claim"
                                size="xs"
                                color="neutral"
                                variant="outline"
                                :label="t('app.settings.plugins.useRepository')"
                                data-plugin-use-repository
                                @click="install('git', `https://${globalOrigin(m.id).claim}`)"
                            />
                            <UTooltip v-if="globalOrigin(m.id).url" :text="t('app.settings.plugins.openOrigin')">
                                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-external-link" :aria-label="t('app.settings.plugins.openOrigin')" @click="openUrlInBrowser(globalOrigin(m.id).url!)"/>
                            </UTooltip>
                        </template>
                        <UTooltip v-if="settingsOf(m)" :text="t('app.settings.plugins.settings')">
                            <UButton
                                size="xs"
                                color="neutral"
                                variant="ghost"
                                icon="i-lucide-settings-2"
                                :aria-label="t('app.settings.plugins.settings')"
                                :to="settingsOf(m)"
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
                            :icon="PLUGIN_ICON"
                            :error="t('app.settings.plugins.broken', {reasons: b.errors.join('; ')})"
                            :data-plugin-broken="b.id"
                        >
                            <UTooltip :text="t('app.settings.plugins.remove')">
                                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('app.settings.plugins.remove')" @click="remove(b.id, b.name ?? b.id)"/>
                            </UTooltip>
                        </SettingsRow>
                    </template>
                    <SettingsRow
                        v-if="group.id === 'community'"
                        setting="plugins.checkUpdates"
                        :label="t('app.settings.plugins.checkAutomatically')"
                        :description="t('app.settings.plugins.checkAutomaticallyDescription')"
                        :info="t('app.settings.plugins.checkAutomaticallyInfo')"
                        data-plugins-check-automatically
                    >
                        <USwitch v-model="checkAutomatically" :aria-label="t('app.settings.plugins.checkAutomatically')"/>
                    </SettingsRow>
                </SettingsSection>
            </template>
            <SettingsSection
                v-if="scope.root.value"
                :title="t('app.settings.plugins.workspace', {name: workspaceName})"
                :description="t('app.settings.plugins.workspaceDescription')"
                :info="t('app.settings.plugins.workspaceInfo')"
                :empty="!own.length && !missing.length ? t('app.settings.plugins.noneInWorkspace') : undefined"
                data-plugins-section="workspace"
            >
                <template v-if="scope.trusted.value && pending.length" #actions>
                    <UButton size="xs" color="warning" variant="outline" icon="i-lucide-shield-check" :label="t('app.settings.plugins.review', {count: pending.length})" data-plugins-accept @click="accept(pending)"/>
                </template>
                <SettingsRow
                    v-for="p in own"
                    :key="p.listed.id"
                    :label="ownRow(p).name"
                    :icon="p.manifest?.icon ?? PLUGIN_ICON"
                    :description="ownRow(p).description"
                    :error="ownRow(p).state"
                    :data-plugin-own="p.listed.id"
                >
                    <UBadge v-if="!scope.trusted.value" size="sm" color="warning" variant="subtle" :label="t('app.settings.plugins.waitsForTrust')"/>
                    <UBadge v-if="waiting.includes(p.listed.id)" size="sm" color="info" variant="subtle" :label="t('app.settings.plugins.waitsForRestart')"/>
                    <UButton
                        v-if="updateOf(p.listed.id, scope.root.value)"
                        size="xs"
                        icon="i-lucide-arrow-up-circle"
                        :loading="busy"
                        :disabled="!scope.trusted.value"
                        :label="updateLabel(updateOf(p.listed.id, scope.root.value)!)"
                        data-plugin-update
                        @click="stageAndInstall({source: updateOf(p.listed.id, scope.root.value)!.source}, 'workspace')"
                    />
                    <UTooltip v-if="ownRow(p).origin.url" :text="t('app.settings.plugins.openOrigin')">
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-external-link" :aria-label="t('app.settings.plugins.openOrigin')" @click="openUrlInBrowser(ownRow(p).origin.url!)"/>
                    </UTooltip>
                    <UTooltip v-if="p.listed.accepted && p.manifest && settingsOf(p.manifest)" :text="t('app.settings.plugins.settings')">
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-settings-2" :aria-label="t('app.settings.plugins.settings')" :to="settingsOf(p.manifest)"/>
                    </UTooltip>
                    <UTooltip :text="t('app.settings.plugins.remove')">
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('app.settings.plugins.remove')" data-plugin-remove @click="remove(p.listed.id, ownRow(p).name, true)"/>
                    </UTooltip>
                    <USwitch v-if="p.manifest" :model-value="isOn({...p.manifest, enabledByDefault: false})" :aria-label="ownRow(p).name" @update:model-value="setOn(p.manifest, $event)"/>
                </SettingsRow>
                <SettingsRow
                    v-for="id in missing"
                    :key="id"
                    :label="id"
                    :icon="PLUGIN_ICON"
                    :description="[t('app.settings.plugins.missing'), shareableSource(sourceOf(id)) ? t('app.settings.plugins.missingFrom', {source: sourceOf(id)}) : t('app.settings.plugins.missingNoSource')].join(' · ')"
                    :data-plugin-missing="id"
                >
                    <UButton
                        v-if="shareableSource(sourceOf(id))"
                        size="xs"
                        icon="i-lucide-download"
                        :loading="busy"
                        :label="t('app.settings.plugins.installMissing')"
                        data-plugin-install-missing
                        @click="stageAndInstall({source: sourceOf(id)!})"
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
