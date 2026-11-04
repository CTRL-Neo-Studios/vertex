import type {AppSettings} from "#shared/types/app/settings";
import type {DeepPartial} from "#shared/types/types";
import {defaultAppSettings} from "#shared/utils/defaults/apps";
import {effectiveSettings, getAt, isOverridden, overridableAs, withAt, type AppSettingPath, type SettingAt} from "#shared/utils/settings/scopes";
import {folderTrustedBy} from "#shared/workflows/trust";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useWorkflowTrust} from "~/composables/workflows/useWorkflowTrust";
import {stateClient} from "~/utils/stateClient";

/**
 * This window's settings scope: a workspace window's own workspace, or in the Settings window the scope being
 * edited (`null` = User, the global settings). `effective` is what the window uses: the global settings with the
 * workspace's overrides on top. Rust owns each `.vertex/settings.json` and broadcasts its changes.
 */
export function useSettingsScope() {
    const {config, save} = useAppSettings()
    const trust = useWorkflowTrust()
    const root = useState<string | null>('settingsScopeRoot', () => null)
    const local = useState<DeepPartial<AppSettings>>('settingsScopeLocal', () => ({}))
    const listening = useState<Promise<unknown> | null>('settingsScopeListening', () => null)

    async function open(next: string | null) {
        root.value = next
        local.value = {}
        await (listening.value ??= stateClient.onWorkspaceSettingsChanged(change => {
            if (change.root === root.value) local.value = change.settings
        }))
        if (!next) return
        await trust.load()
        const settings = await stateClient.getWorkspaceSettings(next)
        if (root.value === next) local.value = settings
    }

    const trusted = computed(() => root.value !== null && folderTrustedBy(trust.records.value, root.value) !== undefined)
    const effective = computed(() => config.value && (root.value ? effectiveSettings(config.value, local.value, trusted.value) : config.value))
    const defaults = defaultAppSettings()

    /** What the current scope sets: a workspace's own override (even one it can't apply yet), else the effective value. */
    const value = <P extends AppSettingPath>(path: P) =>
        getAt(overridden(path) ? local.value : effective.value, path) as SettingAt<AppSettings, P>
    /** Whether the current scope can change `path`: always in User, only allowlisted ones in a workspace. */
    const overridable = (path: AppSettingPath) => root.value === null || overridableAs(path) !== undefined
    function overridden(path: AppSettingPath) {
        return root.value !== null && isOverridden(local.value, path)
    }

    /** Writes to the current scope; in a workspace, settings it can't override are skipped. */
    async function set(patch: Partial<Record<AppSettingPath, unknown>>) {
        const entries = Object.entries(patch) as [AppSettingPath, unknown][]
        if (root.value) return stateClient.updateWorkspaceSettings(root.value, entries.filter(([path]) => overridable(path)))
        return save(entries.reduce((next, [path, v]) => withAt(next, path, v), config.value!))
    }

    /** In User: differs from the stock value. In a workspace: overridden. */
    const isDirty = (paths: AppSettingPath[]) => paths.some(path => root.value
        ? overridden(path)
        : JSON.stringify(getAt(config.value, path)) !== JSON.stringify(getAt(defaults, path)))

    /** In User: back to the stock values. In a workspace: back to the global ones (the overrides go). */
    const reset = (paths: AppSettingPath[]) => set(Object.fromEntries(paths.map(path => [path, root.value ? null : getAt(defaults, path)])))

    return {root, local, trusted, effective, open, value, overridable, overridden, set, isDirty, reset}
}
