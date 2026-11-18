import {getVersion} from "@tauri-apps/api/app";
import type {DropdownMenuItem} from "@nuxt/ui";
import {validateManifest, type PluginManifest} from "#shared/plugin/manifest";
import {withAt, withoutAt} from "#shared/utils/settings/paths";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {enabledPath, sourcePath} from "~/composables/plugins/usePluginSwitches";
import type {PluginUpdate} from "~/composables/plugins/usePluginUpdates";
import {pluginEntries, workspacePlugins, type InstallRecord} from "~/utils/plugins/catalog";
import {shareableSource} from "~/utils/plugins/origin";
import {pickToOpen} from "~/utils/dialogs";
import {vertexInvoke} from "~/utils/vertexInvoke";
import PluginGitModal from "~/components/Modals/PluginGitModal.vue";
import PluginInstallModal, {type InstallTarget} from "~/components/Modals/PluginInstallModal.vue";
import PluginRemoveModal from "~/components/Modals/PluginRemoveModal.vue";
import PluginUrlModal from "~/components/Modals/PluginUrlModal.vue";

interface Staged {
    stage: string
    manifest: unknown
    resolved: InstallRecord
    installed: InstallRecord | null
    workspaceInstalled: InstallRecord | null
    claimed: string | null
    readme: string | null
}

/** A plugin to remove: the installed one, or with `inWorkspace` the edited workspace's copy. */
export interface Removal {
    id: string
    name: string
    inWorkspace: boolean
}

/**
 * Settings → Plugins' installs: for every workspace, or (editing a trusted one) for that workspace, from a Git
 * repository (or a `.zip`, or a folder while developing one). Rust stages one, this validates its manifest and asks.
 * Updates install through the same dialog. Removing asks once for all, then once to restart.
 */
export function usePluginInstalls({updates, offerRestart}: {
    updates: Ref<PluginUpdate[]>
    offerRestart: (plugins: readonly { id: string, name: string }[]) => Promise<void>
}) {
    const {t, locale} = useI18n()
    const appSettings = useAppSettings()
    const scope = useSettingsScope()
    const toasts = useQuickToasts()
    const overlay = useOverlay()
    const installModal = overlay.create(PluginInstallModal)
    const urlModal = overlay.create(PluginUrlModal)
    const gitModal = overlay.create(PluginGitModal)
    const removeModal = overlay.create(PluginRemoveModal)

    const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
    const busy = ref(false)
    const workspaceName = computed(() => scope.root.value?.split(/[\\/]/).filter(Boolean).pop() ?? '')
    const ownCopy = (id: string) => (scope.root.value ? workspacePlugins().find(p => p.listed.id === id) : undefined)
    const installed = (id: string) => pluginEntries().find(e => e.source !== 'core' && e.manifest.id === id)?.manifest

    /** Installs are global whatever scope is being edited: writes these paths to the user's settings. */
    async function saveGlobal(patch: Record<string, unknown>) {
        const next = Object.entries(patch).reduce((s, [path, v]) => (v === undefined ? withoutAt(s, path) : withAt(s, path, v)), appSettings.config.value!)
        if (!(await appSettings.save(next))) throw new Error(t('app.settings.plugins.saveFailed'))
    }

    /**
     * Stages `what` (a source string, or a picked path), validates its manifest, asks, and installs it on: for every
     * workspace, or into the edited workspace when it's trusted and the user picks it (`target` preselects).
     */
    async function stageAndInstall(what: { source: string } | { path: string }, target: InstallTarget = 'global') {
        busy.value = true
        const root = scope.root.value && scope.trusted.value ? scope.root.value : null
        try {
            const {stage, manifest, resolved, installed: record, workspaceInstalled, claimed, readme} = await vertexInvoke<Staged>('plugin_stage', {...what, root})
            const result = validateManifest(manifest, await getVersion())
            const errors = !result.ok ? result.errors
                : pluginEntries().some(e => e.source === 'core' && e.manifest.id === result.manifest.id) ? [t('app.settings.plugins.coreId', {id: result.manifest.id})] : []
            const id = result.ok ? result.manifest.id : ''
            const where = await installModal.open({
                manifest: (manifest ?? {}) as Partial<PluginManifest>,
                errors,
                resolved,
                claimed,
                readme,
                global: {current: installed(id), installed: record},
                workspace: root ? {name: workspaceName.value, current: ownCopy(id)?.manifest, installed: workspaceInstalled} : undefined,
                target: root ? target : 'global',
            })
            if (!where || !result.ok || errors.length) {
                await vertexInvoke('plugin_discard', {stage})
                return
            }
            const inWorkspace = where === 'workspace' && root
            const replaced = inWorkspace ? !!ownCopy(id) : !!installed(id)
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

    const otherWays = computed<DropdownMenuItem[]>(() => [
        {label: t('app.settings.plugins.installZip'), icon: 'i-lucide-file-archive', onSelect: () => install('zip')},
        {label: t('app.settings.plugins.installUrl'), icon: 'i-lucide-link', onSelect: () => install('url')},
        {label: t('app.settings.plugins.installFolder'), icon: 'i-lucide-folder-code', onSelect: () => install('folder')},
    ])

    /** Removes `plugins` after one question naming them (and a workspace's copy, that workspace's choice for it). */
    async function remove(plugins: readonly Removal[]) {
        if (!await removeModal.open({name: new Intl.ListFormat(locale.value).format(plugins.map(p => p.name))})) return
        const removed: Removal[] = []
        for (const p of plugins) {
            try {
                await vertexInvoke('plugin_remove', {id: p.id, root: p.inWorkspace ? scope.root.value : null})
                removed.push(p)
            } catch (error) {
                toasts.error(t('app.settings.plugins.removeFailed', {name: p.name}), message(error))
            }
        }
        const local = removed.filter(p => p.inWorkspace)
        const global = removed.filter(p => !p.inWorkspace)
        try {
            if (local.length) await scope.set(Object.fromEntries(local.flatMap(p => [[enabledPath(p.id), null], [sourcePath(p.id), null]])))
            if (global.length) await saveGlobal(Object.fromEntries(global.flatMap(p => [[enabledPath(p.id), undefined], [sourcePath(p.id), undefined]])))
        } catch (error) {
            toasts.error(t('app.settings.plugins.saveFailed'), message(error))
        }
        await offerRestart(removed)
    }

    return {busy, workspaceName, stageAndInstall, install, otherWays, remove}
}
