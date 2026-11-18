import type {PluginManifest} from "#shared/plugin/manifest";
import {pluginEnabled, resolvePlugins, type OffReason} from "#shared/plugin/resolve";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {installedOrigin, pluginEntries, workspacePlugins} from "~/utils/plugins/catalog";
import {shareableSource} from "~/utils/plugins/origin";
import {pluginStates} from "~/utils/plugins/runtime";
import {stateClient} from "~/utils/stateClient";
import RestartModal from "~/components/Modals/RestartModal.vue";

export const enabledPath = (id: string) => `plugins.enabled.${id}` as AppSettingPath
export const sourcePath = (id: string) => `plugins.sources.${id}` as AppSettingPath

/**
 * Settings → Plugins' switches, in the scope being edited. A workspace may turn any plugin off; one it turns on that's
 * off in the user's settings runs only once the workspace is trusted. A plugin turned off runs on until Vertex
 * restarts (its windows keep their grants till then): turning some off asks once to restart, and their rows say they
 * wait for one.
 */
export function usePluginSwitches() {
    const {t, locale} = useI18n()
    const scope = useSettingsScope()
    const restartModal = useOverlay().create(RestartModal)

    const manifests = computed(() => pluginEntries().map(e => e.manifest))
    const nameOf = (id: string) => manifests.value.find(m => m.id === id)?.name ?? id
    /** Where a plugin came from: the edited workspace's copy's record, else the installed one's, else what the workspace says. */
    const sourceOf = (id: string) => (scope.root.value ? workspacePlugins().find(p => p.listed.id === id)?.listed.record?.source : undefined)
        ?? installedOrigin(id)?.record?.source
        ?? (scope.local.value.plugins?.sources as Record<string, string> | undefined)?.[id]

    /** The switch: this scope's own choice (a workspace's even before it applies), else the effective one, else the default. */
    const isOn = (m: PluginManifest) => (scope.value(enabledPath(m.id)) as boolean | undefined) ?? m.enabledByDefault ?? true

    /** Turned off somewhere but still running there; Rust has updated its grants before this window hears of a change. */
    const waiting = ref<string[]>([])
    watch(() => JSON.stringify(scope.effective.value?.plugins.enabled), async () => {
        waiting.value = await stateClient.pluginsWaitingRestart()
    }, {immediate: true})

    /** Asks once to restart, naming those of `plugins` that still run. */
    async function offerRestart(plugins: readonly { id: string, name: string }[]) {
        waiting.value = await stateClient.pluginsWaitingRestart()
        const names = plugins.filter(p => waiting.value.includes(p.id)).map(p => p.name)
        if (names.length && await restartModal.open({name: new Intl.ListFormat(locale.value).format(names)})) await stateClient.restart()
    }

    /** Turns `plugins` on or off in one write. A workspace that turns a community plugin on says where it came from, for its other devices. */
    async function setOn(plugins: readonly PluginManifest[], on: boolean) {
        const patch: Partial<Record<AppSettingPath, unknown>> = {}
        for (const m of plugins) {
            patch[enabledPath(m.id)] = on
            const source = on && scope.root.value ? sourceOf(m.id) : undefined
            if (shareableSource(source)) patch[sourcePath(m.id)] = source
        }
        await scope.set(patch)
        if (on) waiting.value = await stateClient.pluginsWaitingRestart()
        else await offerRestart(plugins)
    }

    const resolution = computed(() => resolvePlugins(
        manifests.value,
        m => pluginEnabled(m, scope.effective.value?.plugins.enabled ?? {}),
        new Set(manifests.value.map(m => m.id)),
    ))
    /** Turned on by this workspace but not running, as it isn't trusted. */
    const blocked = (m: PluginManifest) => scope.root.value !== null && !scope.trusted.value && isOn(m)
        && resolution.value.off.get(m.id)?.kind === 'disabled'

    /** Why a plugin that's on doesn't run: it failed in this window, or a requirement is missing, off, or circular. */
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

    return {manifests, nameOf, sourceOf, isOn, setOn, waiting, offerRestart, blocked, reasonText}
}
