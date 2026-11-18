import {listen} from "@tauri-apps/api/event";
import {withAt} from "#shared/utils/settings/paths";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import type {InstallRecord} from "~/utils/plugins/catalog";
import {vertexInvoke} from "~/utils/vertexInvoke";

/** A plugin whose source has something newer (Rust's `plugin_updates`); `root`: a workspace's copy. */
export interface PluginUpdate {
    id: string
    root: string | null
    source: string
    installed: InstallRecord
    available: InstallRecord
}

/**
 * Settings → Plugins' updates: the last check's (opening the page asks nobody; Check for updates asks each plugin's
 * source), and whether Rust checks at launch and daily. They install only through the install dialog.
 */
export function usePluginUpdates() {
    const {t} = useI18n()
    const appSettings = useAppSettings()
    const scope = useSettingsScope()
    const toasts = useQuickToasts()

    const updates = ref<PluginUpdate[]>([])
    const checking = ref(false)
    const updateOf = (id: string, root: string | null = null) => updates.value.find(u => u.id === id && u.root === root)

    let unlisten: (() => void) | undefined
    onMounted(async () => {
        updates.value = await vertexInvoke<PluginUpdate[]>('plugin_updates', {check: false})
        unlisten = await listen<PluginUpdate[]>('vertex://plugin-updates', e => (updates.value = e.payload))
    })
    onBeforeUnmount(() => unlisten?.())

    async function checkUpdates() {
        checking.value = true
        try {
            updates.value = await vertexInvoke<PluginUpdate[]>('plugin_updates', {check: true, root: scope.root.value})
            if (!updates.value.length) toasts.success(t('app.settings.plugins.upToDate'))
        } catch (error) {
            toasts.error(t('app.settings.plugins.checkFailed'), error instanceof Error ? error.message : String(error))
        } finally {
            checking.value = false
        }
    }

    /** Global whatever scope is edited (its row says Global only in a workspace). */
    const checkAutomatically = computed({
        get: () => appSettings.config.value?.plugins.checkUpdates ?? false,
        set: on => void appSettings.save(withAt(appSettings.config.value!, 'plugins.checkUpdates', on))
            .then(saved => saved || toasts.error(t('app.settings.plugins.saveFailed'))),
    })

    return {updates, checking, updateOf, checkUpdates, checkAutomatically}
}
