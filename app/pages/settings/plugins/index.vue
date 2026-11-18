<script setup lang="ts">
import type {SettingsListAction, SettingsListFilter} from "#shared/plugin/components";
import {parseRequirement, type PluginManifest} from "#shared/plugin/manifest";
import {Routes} from "#shared/constants/app";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useTrust} from "~/composables/app/useTrust";
import {usePluginInstalls} from "~/composables/plugins/usePluginInstalls";
import {enabledPath, usePluginSwitches} from "~/composables/plugins/usePluginSwitches";
import {usePluginUpdates, type PluginUpdate} from "~/composables/plugins/usePluginUpdates";
import {brokenPlugins, installedOrigin, missingPlugins, pluginEntries, workspacePlugins, type InstalledOrigin} from "~/utils/plugins/catalog";
import {describeOrigin, originUrl, shareableSource} from "~/utils/plugins/origin";
import {contributionPlugin} from "~/utils/plugins/runtime";
import {settingsPages} from "~/utils/contributions";
import {PLUGIN_ICON, pluginSettingsRoute} from "~/utils/settingsNav";
import {pluginAssetUrl} from "~/utils/fileUrl";
import PluginDetailsModal from "~/components/Modals/PluginDetailsModal.vue";

definePageMeta({
    layout: 'settings'
})

/**
 * Settings → Plugins: every plugin in one list (core, community, and while a workspace is edited its own and those it
 * turns on that this device lacks), with its switch in the scope being edited; a search, a filter, and Turn on, Turn
 * off, Update and Remove for a selection. A row opens the plugin's details (`PluginDetailsModal`). Installing,
 * updating and removing are `usePluginInstalls`, the switches `usePluginSwitches`, updates `usePluginUpdates`.
 */
const {t} = useI18n()
const scope = useSettingsScope()
const trust = useTrust()
const switches = usePluginSwitches()
const {isOn, nameOf} = switches
const updates = usePluginUpdates()
const installs = usePluginInstalls({updates: updates.updates, offerRestart: switches.offerRestart})

/** Where a plugin's gear goes: its nav entry (`pluginSettingsRoute`). */
const settingsOf = (m: PluginManifest) =>
    pluginSettingsRoute(m.id, [...settingsPages.items.values()].map(def => ({def, owner: contributionPlugin(def)})), m, Routes.settings)

interface Row {
    /** `<group>:<plugin id>`: a workspace's copy and the installed plugin are two rows. */
    id: string
    plugin: string
    group: 'core' | 'community' | 'workspace'
    name: string
    icon: string
    /** What the switch turns; none for a broken install or a missing plugin. */
    manifest?: PluginManifest
    on?: boolean
    version?: string
    description?: string
    error?: string
    waitsForTrust?: boolean
    /** This workspace's own choice for an installed plugin, with Use global. */
    overridden?: boolean
    update?: PluginUpdate
    settings?: ReturnType<typeof settingsOf>
    /** A repository it names that it wasn't fetched from, and the web page of where it was. */
    claim?: string
    url?: string
    /** A workspace's plugin this device lacks, and where the workspace says it comes from. */
    missingFrom?: string | null
    /** Author, needs, uses, where it's from: its details' lines. */
    facts: string[]
}

/** A plugin's author, needs and uses. */
function about(m: PluginManifest) {
    const needs = (m.requires ?? []).map(parseRequirement)
        .map(r => (r.optional ? t('app.settings.plugins.optional', {name: nameOf(r.id)}) : nameOf(r.id)))
    const uses = (m.permissions ?? []).map(p => t(`app.settings.plugins.permission.${p}`))
    return [
        m.author && t('app.settings.plugins.installModal.by', {author: m.author}),
        needs.length && t('app.settings.plugins.needs', {names: needs.join(', ')}),
        uses.length && t('app.settings.plugins.uses', {list: uses.join(', ')}),
    ].filter((line): line is string => !!line)
}
/** Where it came from; `unknown`: what to say without a record (installed before records; copied into a workspace). */
function origin(from: Pick<InstalledOrigin, 'record' | 'claimed'> | undefined, unknown = 'app.settings.plugins.origin.unknown') {
    const record = from?.record
    const claim = from?.claimed && from.claimed !== record?.origin ? from.claimed : undefined
    return {
        claim,
        url: record ? originUrl(record) : undefined,
        lines: [record ? describeOrigin(record, t) : t(unknown), claim && t('app.settings.plugins.origin.claims', {origin: claim})].filter((line): line is string => !!line),
    }
}

const rows = computed<Row[]>(() => {
    const root = scope.root.value
    const own = root ? workspacePlugins() : []
    const installed = (m: PluginManifest, group: 'core' | 'community'): Row => {
        const from = group === 'community' ? origin(installedOrigin(m.id)) : undefined
        return {
            id: `${group}:${m.id}`, plugin: m.id, group, name: m.name, icon: m.icon ?? PLUGIN_ICON, manifest: m, on: isOn(m),
            version: group === 'community' ? m.version : undefined, description: m.description, error: switches.reasonText(m),
            waitsForTrust: switches.blocked(m), overridden: scope.overridden(enabledPath(m.id)),
            update: group === 'community' ? updates.updateOf(m.id) : undefined, settings: settingsOf(m),
            claim: from?.claim, url: from?.url,
            facts: [...about(m), ...from?.lines ?? [], ...(own.some(p => p.listed.id === m.id) ? [t('app.settings.plugins.ownCopyHere')] : [])],
        }
    }
    return [
        ...pluginEntries().map(e => installed(e.manifest, e.source === 'core' ? 'core' : 'community')),
        ...brokenPlugins().map((b): Row => ({
            id: `community:${b.id}`, plugin: b.id, group: 'community', name: b.name ?? b.id, icon: PLUGIN_ICON,
            error: t('app.settings.plugins.broken', {reasons: b.errors.join('; ')}), facts: [],
        })),
        ...own.map((p): Row => {
            const m = p.manifest
            const from = origin(p.listed, 'app.settings.plugins.origin.copied')
            return {
                id: `workspace:${p.listed.id}`, plugin: p.listed.id, group: 'workspace', name: m?.name ?? p.listed.id, icon: m?.icon ?? PLUGIN_ICON,
                manifest: m, on: m && isOn({...m, enabledByDefault: false}), version: m?.version, description: m?.description,
                error: p.errors.length ? t('app.settings.plugins.broken', {reasons: p.errors.join('; ')})
                    : scope.trusted.value && !p.listed.accepted ? t('app.settings.plugins.notAccepted') : undefined,
                waitsForTrust: !scope.trusted.value, update: updates.updateOf(p.listed.id, root),
                settings: p.listed.accepted && m ? settingsOf(m) : undefined, claim: from.claim, url: from.url,
                facts: [...m ? about(m) : [], ...from.lines],
            }
        }),
        ...(root ? missingPlugins(scope.local.value.plugins?.enabled) : []).map((id): Row => {
            const source = switches.sourceOf(id)
            return {
                id: `workspace:${id}`, plugin: id, group: 'workspace', name: id, icon: PLUGIN_ICON,
                description: t('app.settings.plugins.missing'), missingFrom: shareableSource(source) ? source : null,
                facts: [shareableSource(source) ? t('app.settings.plugins.missingFrom', {source}) : t('app.settings.plugins.missingNoSource')],
            }
        }),
    ]
})
const anyBlocked = computed(() => rows.value.some(row => row.group !== 'workspace' && row.waitsForTrust))
const pending = computed(() => (scope.root.value ? workspacePlugins().filter(p => p.manifest && !p.listed.accepted) : []))

const query = ref('')
const filter = ref('all')
const filters = computed<SettingsListFilter<Row>[]>(() => [
    {id: 'all', label: t('app.settings.plugins.filter.all')},
    {id: 'on', label: t('app.settings.plugins.filter.on'), test: row => row.on === true},
    {id: 'off', label: t('app.settings.plugins.filter.off'), test: row => row.on === false},
    {id: 'updates', label: t('app.settings.plugins.filter.updates'), test: row => !!row.update},
])
const canUpdate = (row: Row) => !!row.update && (row.group !== 'workspace' || scope.trusted.value)
const canRemove = (row: Row) => row.group !== 'core' && row.missingFrom === undefined
const update = (row: Row) => installs.stageAndInstall({source: row.update!.source}, row.group === 'workspace' ? 'workspace' : 'global')
const remove = (list: Row[]) => installs.remove(list.map(row => ({id: row.plugin, name: row.name, inWorkspace: row.group === 'workspace'})))
const actions = computed<SettingsListAction<Row>[]>(() => [
    {id: 'on', label: count => t('app.settings.plugins.turnOn', {count}), icon: 'i-lucide-power',
     applies: row => row.on === false, run: list => switches.setOn(list.map(row => row.manifest!), true)},
    {id: 'off', label: count => t('app.settings.plugins.turnOff', {count}), icon: 'i-lucide-power-off',
     applies: row => row.on === true, run: list => switches.setOn(list.map(row => row.manifest!), false)},
    {id: 'update', label: count => t('app.settings.plugins.updateSelected', {count}), icon: 'i-lucide-arrow-up-circle', color: 'primary',
     applies: canUpdate, run: async list => {
         for (const row of list) await update(row)
     }},
    {id: 'remove', label: count => t('app.settings.plugins.removeSelected', {count}), icon: 'i-lucide-trash-2', color: 'error',
     applies: canRemove, run: remove},
])
const groupOf = (row: Row) => (row.group === 'workspace' ? t('app.settings.plugins.workspace', {name: installs.workspaceName.value}) : t(`app.settings.plugins.${row.group}`))
const updateLabel = (u: PluginUpdate) => t('app.settings.plugins.updateTo', {to: u.available.name ?? u.available.commit?.slice(0, 7) ?? ''})

const detailsModal = useOverlay().create(PluginDetailsModal)
/** A row's details; what the dialog closes with is done here. */
async function openDetails(row: Row) {
    const action = await detailsModal.open({
        name: row.name, icon: row.icon, version: row.version, description: row.description, error: row.error, facts: row.facts,
        readmeOf: canRemove(row) ? {id: row.plugin, root: row.group === 'workspace' ? scope.root.value : null} : undefined,
        assetUrl: row.group === 'community' ? (path: string) => pluginAssetUrl(row.plugin, path) : undefined,
        url: row.url, claim: row.claim, removable: canRemove(row), update: row.update && canUpdate(row) ? updateLabel(row.update) : undefined,
    })
    if (action === 'update') await update(row)
    else if (action === 'remove') await remove([row])
    else if (action === 'repository') await installs.install('git', `https://${row.claim}`)
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
                :actions="[{label: t('app.settings.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                data-plugins-untrusted
            />
            <SettingsSection
                :title="t('app.settings.plugins.all')"
                :description="t('app.settings.plugins.allDescription')"
                :info="t('app.settings.plugins.allInfo')"
                data-plugins-section="all"
            >
                <template #actions>
                    <UButton
                        v-if="scope.trusted.value && pending.length"
                        size="xs"
                        color="warning"
                        variant="outline"
                        icon="i-lucide-shield-check"
                        :label="t('app.settings.plugins.review', {count: pending.length})"
                        data-plugins-accept
                        @click="trust.acceptPlugins(scope.root.value!, pending)"
                    />
                    <UFieldGroup size="xs">
                        <UButton color="neutral" variant="outline" icon="i-lucide-git-branch" :loading="installs.busy.value" :label="t('app.settings.plugins.install')" data-plugins-install @click="installs.install('git')"/>
                        <UDropdownMenu :items="installs.otherWays.value" :content="{align: 'end'}">
                            <UButton color="neutral" variant="outline" icon="i-lucide-chevron-down" :aria-label="t('app.settings.plugins.installOther')" data-plugins-install-other/>
                        </UDropdownMenu>
                    </UFieldGroup>
                </template>
                <SettingsList
                    v-model:query="query"
                    v-model:filter="filter"
                    :items="rows"
                    :text="row => `${row.name} ${row.description ?? ''} ${row.plugin}`"
                    :group="groupOf"
                    :filters
                    :actions
                    :selectable="row => row.missingFrom === undefined"
                    :placeholder="t('app.settings.plugins.search')"
                    :empty="t('app.settings.plugins.none')"
                >
                    <template #row="{item}">
                        <button type="button" class="flex items-center gap-3 min-w-0 w-full text-start group" data-plugin-open @click="openDetails(item)">
                            <UIcon :name="item.icon" class="size-5 shrink-0 text-muted"/>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5 min-w-0 text-sm text-default">
                                    <span class="truncate group-hover:text-primary">{{ item.name }}</span>
                                    <span v-if="item.version" class="shrink-0 text-xs text-dimmed" data-plugin-version>{{ item.version }}</span>
                                    <UBadge v-if="item.overridden" size="sm" color="primary" variant="subtle" :label="t('app.settings.scope.changed')"/>
                                    <UBadge v-if="item.waitsForTrust" size="sm" color="warning" variant="subtle" :label="t('app.settings.plugins.waitsForTrust')"/>
                                    <UBadge v-if="switches.waiting.value.includes(item.plugin)" size="sm" color="info" variant="subtle" :label="t('app.settings.plugins.waitsForRestart')" data-plugin-restart/>
                                </div>
                                <div v-if="item.error" class="text-xs text-error truncate" :title="item.error">{{ item.error }}</div>
                                <div v-else-if="item.description" class="text-xs text-muted truncate" :title="item.description">{{ item.description }}</div>
                            </div>
                        </button>
                    </template>
                    <template #actions="{item}">
                        <UTooltip v-if="item.update" :text="updateLabel(item.update)">
                            <UButton
                                size="xs"
                                variant="soft"
                                icon="i-lucide-arrow-up-circle"
                                :loading="installs.busy.value"
                                :disabled="!canUpdate(item)"
                                :label="t('app.settings.plugins.update')"
                                data-plugin-update
                                @click="update(item)"
                            />
                        </UTooltip>
                        <UButton
                            v-if="item.missingFrom"
                            size="xs"
                            icon="i-lucide-download"
                            :loading="installs.busy.value"
                            :label="t('app.settings.plugins.installMissing')"
                            data-plugin-install-missing
                            @click="installs.stageAndInstall({source: item.missingFrom!})"
                        />
                        <UButton
                            v-if="item.overridden"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-undo-2"
                            :label="t('app.settings.scope.useGlobal')"
                            @click="scope.reset([enabledPath(item.plugin)])"
                        />
                        <UTooltip v-if="item.settings" :text="t('app.settings.plugins.settings')">
                            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-settings-2" :aria-label="t('app.settings.plugins.settings')" :to="item.settings"/>
                        </UTooltip>
                        <USwitch v-if="item.manifest" :model-value="item.on" :aria-label="item.name" @update:model-value="switches.setOn([item.manifest], $event)"/>
                    </template>
                </SettingsList>
            </SettingsSection>
            <SettingsSection :title="t('app.settings.plugins.updates')" data-plugins-section="updates">
                <template #actions>
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="updates.checking.value" :label="t('app.settings.plugins.checkUpdates')" data-plugins-check @click="updates.checkUpdates"/>
                </template>
                <SettingsRow
                    setting="plugins.checkUpdates"
                    :label="t('app.settings.plugins.checkAutomatically')"
                    :description="t('app.settings.plugins.checkAutomaticallyDescription')"
                    :info="t('app.settings.plugins.checkAutomaticallyInfo')"
                    data-plugins-check-automatically
                >
                    <USwitch v-model="updates.checkAutomatically.value" :aria-label="t('app.settings.plugins.checkAutomatically')"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
