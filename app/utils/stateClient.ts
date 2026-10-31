import {invoke} from "@tauri-apps/api/core";
import {emit, listen, type UnlistenFn} from "@tauri-apps/api/event";
import type {AppSession} from "#shared/types/app/sessions";
import type {AppSettings} from "#shared/types/app/settings";

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
    takeOpenRequests: 'take_open_requests',
} as const

export const StateEvent = {
    sessionsChanged: 'vertex://sessions-changed',
    settingsChanged: 'vertex://settings-changed',
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

    takeOpenRequests: () => invoke<string[]>(StateCommand.takeOpenRequests),
    onOpenRequested: (cb: () => void): Promise<UnlistenFn> => listen(StateEvent.openRequested, () => cb()),

    /** Quit handshake: Rust asks every session window to flush before exiting. */
    onFlushRequested: (cb: () => Promise<void>): Promise<UnlistenFn> => listen(StateEvent.flushRequested, () => cb()),
    flushDone: (windowLabel: string) => emit(StateEvent.flushDone, windowLabel),
    quit: () => invoke('quit_app'),
}
