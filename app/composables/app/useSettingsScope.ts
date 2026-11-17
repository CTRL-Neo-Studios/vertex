import type {AppSettings} from "#shared/types/app/settings";
import type {DeepPartial} from "#shared/types/types";
import {defaultAppSettings} from "#shared/utils/defaults/apps";
import {movedPathsIn, withMovedPaths} from "#shared/utils/settings/legacy";
import {getAt, withAt, withoutAt} from "#shared/utils/settings/paths";
import {effectiveSettings, isOverridden, overridableAs, settingsAllowlist, type AppSettingPath, type SettingAt} from "#shared/utils/settings/scopes";
import {folderTrustedBy} from "#shared/utils/trust";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useTrust} from "~/composables/app/useTrust";
import {pluginManifests} from "~/utils/plugins/catalog";
import {stateClient} from "~/utils/stateClient";

/** The kernel's overridable settings and each plugin's (its manifest's `config.overridable`), installed ones included. */
const allowlist = computed(() => settingsAllowlist(pluginManifests()))

/**
 * This window's settings scope: a workspace window's own workspace, or in the Settings window the scope being
 * edited (`null` = User, the global settings). `effective` is what the window uses: the global settings with the
 * workspace's overrides on top. Rust owns each `.vertex/settings.json` and broadcasts its changes.
 */
export function useSettingsScope() {
    const {config, save} = useAppSettings()
    const trust = useTrust()
    const root = useState<string | null>('settingsScopeRoot', () => null)
    /** The workspace's overrides, moved settings read at their new paths (`LEGACY_PATHS`). */
    const local = useState<DeepPartial<AppSettings>>('settingsScopeLocal', () => ({}))
    /** The same as stored, so the next write can move what's still at an old path. */
    const localRaw = useState<unknown>('settingsScopeLocalRaw', () => ({}))
    const listening = useState<Promise<unknown> | null>('settingsScopeListening', () => null)

    function receive(raw: unknown) {
        localRaw.value = raw
        local.value = withMovedPaths(raw as DeepPartial<AppSettings>)
    }

    async function open(next: string | null) {
        root.value = next
        receive({})
        await (listening.value ??= stateClient.onWorkspaceSettingsChanged(change => {
            if (change.root === root.value) receive(change.settings)
        }))
        if (!next) return
        await trust.load()
        const settings = await stateClient.getWorkspaceSettings(next)
        if (root.value === next) receive(settings)
    }

    const trusted = computed(() => root.value !== null && folderTrustedBy(trust.records.value, root.value) !== undefined)
    const effective = computed(() => config.value && (root.value ? effectiveSettings(config.value, local.value, trusted.value, allowlist.value) : config.value))
    const defaults = defaultAppSettings()

    /** What the current scope sets: a workspace's own override (even one it can't apply yet), else the effective value. */
    const value = <P extends AppSettingPath>(path: P) =>
        getAt(overridden(path) ? local.value : effective.value, path) as SettingAt<AppSettings, P>
    /** Whether the current scope can change `path`: always in User, only allowlisted ones in a workspace. */
    const overridable = (path: AppSettingPath) => root.value === null || overridableAs(path, allowlist.value) !== undefined
    function overridden(path: AppSettingPath) {
        return root.value !== null && isOverridden(local.value, path)
    }

    /** Writes to the current scope (`null` removes); in a workspace, settings it can't override are skipped. */
    async function set(patch: Partial<Record<AppSettingPath, unknown>>) {
        const entries = Object.entries(patch) as [AppSettingPath, unknown][]
        if (root.value) {
            // Settings still at an old path move to their new one with this write.
            const moves = movedPathsIn(localRaw.value)
            const updates: [string, unknown][] = [
                ...moves.map(([, to]) => [to, getAt(local.value, to)] as [string, unknown]),
                ...entries.filter(([path]) => overridable(path)),
                ...moves.map(([from]) => [from, null] as [string, unknown]),
            ]
            return stateClient.updateWorkspaceSettings(root.value, updates)
        }
        return save(entries.reduce((next, [path, v]) => (v === null ? withoutAt(next, path) : withAt(next, path, v)), config.value!))
    }

    /** In User: differs from the stock value. In a workspace: overridden. */
    const isDirty = (paths: AppSettingPath[]) => paths.some(path => root.value
        ? overridden(path)
        : JSON.stringify(getAt(config.value, path)) !== JSON.stringify(getAt(defaults, path)))

    /** In User: back to the stock values. In a workspace: back to the global ones (the overrides go). */
    const reset = (paths: AppSettingPath[]) => set(Object.fromEntries(paths.map(path => [path, root.value ? null : getAt(defaults, path)])))

    /** Who may override `path` from a workspace; `undefined` = global only. */
    const levelOf = (path: AppSettingPath) => overridableAs(path, allowlist.value)

    return {root, local, trusted, effective, open, value, overridable, overridden, levelOf, set, isDirty, reset}
}
