import {Routes, sessionWindowLabel, StateKey} from "#shared/constants/app";
import type {PossiblyRef} from "#shared/types/types";
import type {AppSession} from "#shared/types/app/sessions";
import type {SessionRecoveryMode} from "#shared/types/app/settings";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {stateClient} from "~/utils/stateClient";

/*
Window model
- `main` is the anchor: never destroyed during runtime, hidden while any `session-{uuid}` window exists
  (Rust `sync_main_visibility` enforces this on window create/destroy).
- `session-{uuid}` windows edit one workspace/singlespace; the uuid in the label is the AppSession uuid.
- `settings` is a singleton utility window, never persisted.

Persistence
- Rust (src-tauri/src/state.rs) is the only writer of sessions.json. This composable is a per-window
  mirror kept fresh by the `sessions-changed` event; it never reads or writes disk itself.
*/
export function useAppSessions() {
    const $win = useAppWebviewWindows()

    const appSessions = useState<AppSession[]>(StateKey.appSessions, () => [])
    const currentAppSession = useState<AppSession | null>(StateKey.currentAppSession, () => null)

    /** Replace the local mirror with Rust's authoritative list, most recent first. */
    function applySessions(list: AppSession[]) {
        const time = (s: AppSession) => (s.lastUpdated ? new Date(s.lastUpdated).getTime() : 0)
        appSessions.value = [...list].sort((a, b) => time(b) - time(a))
        const current = currentAppSession.value
        if (current) currentAppSession.value = list.find(s => s.uuid === current.uuid) ?? current
    }

    async function load() {
        applySessions(await stateClient.listSessions())
    }

    /** Subscribe once per window (called from the init plugin). */
    function listen() {
        return stateClient.onSessionsChanged(applySessions)
    }

    async function addAppSession(session: AppSession) {
        await stateClient.upsertSession(session)
        return session
    }

    async function removeAppSession(sessionId: PossiblyRef<string>) {
        await stateClient.removeSession(unref(sessionId))
    }

    async function updateAppSession(sessionId: PossiblyRef<string>, patch: Partial<AppSession>) {
        await stateClient.upsertSession({...patch, uuid: unref(sessionId), lastUpdated: new Date()})
    }

    function getAppSession(sessionId: PossiblyRef<string>) {
        return unref(appSessions).find(s => s.uuid === unref(sessionId))
    }

    function getAppSessionFromAbsolutePath(absolutePath: PossiblyRef<string>) {
        return unref(appSessions).find(s => s.rootFileOrFolderAbsolutePath === unref(absolutePath))
    }

    /** Resolve this window's AppSession from its `session-{uuid}` label. */
    async function initializeCurrentAppSession() {
        await load()
        const uuid = $win.getCurrentAppWindowSessionIdFromLabel()
        if (!uuid) {
            currentAppSession.value = null
            return
        }
        const found = getAppSession(uuid)
        if (!found) console.error(`[useAppSessions] window session-${uuid} has no persisted AppSession`)
        currentAppSession.value = found ?? null
        return found
    }

    function getCurrentAppSession() {
        return unref(currentAppSession)
    }

    function shouldRecover(mode: SessionRecoveryMode, session: AppSession) {
        if (!session.rootFileOrFolderAbsolutePath) return false
        if (mode === 'both') return true
        if (mode === 'workspaces') return session.sessionType === 'workspace'
        if (mode === 'singlespaces') return session.sessionType === 'singlespace'
        return false
    }

    /** Main window only: reopen persisted session windows allowed by the recovery setting. */
    async function recoverSavedAppSessions(mode: SessionRecoveryMode) {
        if (!$win.isCurrentAppWindowMain()) return
        await load()
        for (const session of unref(appSessions)) {
            if (shouldRecover(mode, session)) await createWindowFromAppSession(session)
        }
    }

    async function createWindowFromAppSession(session: AppSession) {
        if (!session?.rootFileOrFolderAbsolutePath) return
        const title = fileNameFromPath(session.rootFileOrFolderAbsolutePath)
        return $win.createAppWebviewWindow(Routes.loading, sessionWindowLabel(session.uuid), title)
    }

    function getWebviewWindowWithAppSession(session: PossiblyRef<AppSession>) {
        return $win.getAppWindowWithLabel(sessionWindowLabel(unref(session).uuid))
    }

    return {
        appSessions,
        currentAppSession,
        load,
        listen,
        addAppSession,
        removeAppSession,
        updateAppSession,
        getAppSession,
        getAppSessionFromAbsolutePath,
        initializeCurrentAppSession,
        getCurrentAppSession,
        recoverSavedAppSessions,
        createWindowFromAppSession,
        getWebviewWindowWithAppSession,
    }
}
