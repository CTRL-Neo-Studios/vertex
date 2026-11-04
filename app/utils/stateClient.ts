import {invoke} from "@tauri-apps/api/core";
import {emit, listen, type UnlistenFn} from "@tauri-apps/api/event";
import type {AppSession} from "#shared/types/app/sessions";
import type {AppSettings} from "#shared/types/app/settings";
import type {TrustRecords} from "#shared/workflows/trust";
import type {DeepPartial} from "#shared/types/types";

/**
 * Thin, lifecycle-free client for the Rust single-writer state (src-tauri/src/state.rs).
 * Safe to call from plugins, callbacks and composables alike. Names mirror the Rust commands/events.
 */
export const StateCommand = {
    sessionsList: 'sessions_list',
    sessionsUpsert: 'sessions_upsert',
    sessionsRemove: 'sessions_remove',
    settingsGet: 'settings_get',
    settingsSet: 'settings_set',
    trustGet: 'trust_get',
    trustSet: 'trust_set',
    trustClear: 'trust_clear',
    trustMove: 'trust_move',
    trustFollowEdit: 'trust_follow_edit',
    trustPin: 'trust_pin',
    workspaceSettingsGet: 'workspace_settings_get',
    workspaceSettingsUpdate: 'workspace_settings_update',
    workspaceSettingsReload: 'workspace_settings_reload',
    takeOpenRequests: 'take_open_requests',
} as const

export const StateEvent = {
    sessionsChanged: 'vertex://sessions-changed',
    settingsChanged: 'vertex://settings-changed',
    trustChanged: 'vertex://trust-changed',
    workspaceSettingsChanged: 'vertex://workspace-settings-changed',
    openRequested: 'vertex://open-requested',
    flushRequested: 'vertex://flush-requested',
    flushDone: 'vertex://flush-done',
} as const

export const stateClient = {
    listSessions: () => invoke<AppSession[]>(StateCommand.sessionsList),
    /** Insert or shallow-merge by uuid; nested objects such as `context` are replaced whole. */
    upsertSession: (session: Partial<AppSession> & { uuid: string }) => invoke<AppSession>(StateCommand.sessionsUpsert, {session}),
    removeSession: (uuid: string) => invoke(StateCommand.sessionsRemove, {uuid}),
    onSessionsChanged: (cb: (sessions: AppSession[]) => void): Promise<UnlistenFn> =>
        listen<AppSession[]>(StateEvent.sessionsChanged, e => cb(e.payload)),

    /** Raw stored settings; `null` on first launch. Normalise with `defaultAppSettings`. */
    getSettings: () => invoke<Partial<AppSettings> | null>(StateCommand.settingsGet),
    setSettings: (settings: AppSettings) => invoke(StateCommand.settingsSet, {settings}),
    onSettingsChanged: (cb: (settings: Partial<AppSettings>) => void): Promise<UnlistenFn> =>
        listen<Partial<AppSettings>>(StateEvent.settingsChanged, e => cb(e.payload)),

    /** Raw `trust.json`; normalise with `defaultTrustRecords`. */
    getTrust: () => invoke<unknown>(StateCommand.trustGet),
    /** One entry; `null` revokes it. Never a whole-store write, so windows can't undo each other's changes. */
    setTrust: <K extends keyof TrustRecords>(kind: K, path: string, record: TrustRecords[K][string] | null) =>
        invoke(StateCommand.trustSet, {kind, path, record}),
    clearTrust: () => invoke(StateCommand.trustClear),
    onTrustChanged: (cb: (trust: unknown) => void): Promise<UnlistenFn> =>
        listen<unknown>(StateEvent.trustChanged, e => cb(e.payload)),
    /** A rename or move inside an open workspace: trust at or under `from` moves to `to`. */
    moveTrust: (from: string, to: string) => invoke(StateCommand.trustMove, {from, to}),
    /** An edit in Vertex: the file stays trusted only if it was trusted with program `from`. */
    followTrustEdit: (path: string, from: string, to: string) => invoke(StateCommand.trustFollowEdit, {path, from, to}),
    /** Pins `path`'s program in trusted `folder` (`null` unpins); nothing if the folder isn't trusted. */
    pinTrust: (folder: string, path: string, hash: string | null) => invoke(StateCommand.trustPin, {folder, path, hash}),

    /** A workspace's `.vertex/settings.json`: only what it overrides; normalise with `effectiveSettings`. */
    getWorkspaceSettings: (root: string) => invoke<DeepPartial<AppSettings>>(StateCommand.workspaceSettingsGet, {root}),
    /** `[dotted path, value]` pairs; `null` removes the override. */
    updateWorkspaceSettings: (root: string, updates: [string, unknown][]) =>
        invoke(StateCommand.workspaceSettingsUpdate, {root, updates}),
    reloadWorkspaceSettings: (root: string) => invoke(StateCommand.workspaceSettingsReload, {root}),
    onWorkspaceSettingsChanged: (cb: (change: {root: string, settings: DeepPartial<AppSettings>}) => void): Promise<UnlistenFn> =>
        listen<{root: string, settings: DeepPartial<AppSettings>}>(StateEvent.workspaceSettingsChanged, e => cb(e.payload)),

    takeOpenRequests: () => invoke<string[]>(StateCommand.takeOpenRequests),
    onOpenRequested: (cb: () => void): Promise<UnlistenFn> => listen(StateEvent.openRequested, () => cb()),

    /** Quit handshake: Rust asks every session window to flush before exiting. */
    onFlushRequested: (cb: () => Promise<void>): Promise<UnlistenFn> => listen(StateEvent.flushRequested, () => cb()),
    flushDone: (windowLabel: string) => emit(StateEvent.flushDone, windowLabel),
    quit: () => invoke('quit_app'),
}
