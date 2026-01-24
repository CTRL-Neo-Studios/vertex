import type { PossiblyRef } from "#shared/types/types";
import { LazyStore } from "@tauri-apps/plugin-store";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useFileIO} from "~/composables/io/useFileIO";
import type {AppSession} from "#shared/types/app/sessions";
import {defaultAppSession} from "#shared/utils/defaults/apps";

interface AppSessionsStore {
    openedSessions: AppSession[],
    lastOpenedSession?: string
}

/*
The core model of window management in Vertex:

Since each windows have their own unique labels according to Tauri and that the main started window's label never changes, we can use the main window as an anchor.

This gives us:
- Only one window is labeled `main`
- All window labels have to be unique

So from this logic, we're extending our own logic flow:
- `main` window is used to only create `settings` windows and `session-` windows.
- `session-{uuid}` windows are windows that loads a workspace/singlespace by default and cannot go to other routes like settings or main.
- `settings` window must have one and no more than one instance, same for `main` window
- `main` window cannot be destroyed during app runtime, only hidden (so we have our anchor); `settings` window can be destroyed during app runtime.
- `main` window acts as an anchor that stores and keeps track of all other window sessions.

In terms of session management, an `ActiveWindowSession` must be able to store sufficient and necessary data to recover an app's previous windows, including restoring the tabs of singlespace/workspaces.

When a window initializes:
- Gets all saved active window session from the local store and defines the current webview window
- the main window tries to recreate other webview windows according to the saved window sessions, hide itself if any is created
- if the current window is a `session-` window, recover the opened tabs, opened folders, etc.

This composable manages the windows and sessions. While this composable is mainly meant to be used on the `main` window, it also provides other functions that'll be useful for other windows.
*/
export function useAppSessions() {
    // Ideally, the store filename should be unique or consistent across the app
    const store = new LazyStore('sessions.json');
    const $win = useAppWebviewWindows()
    const $fio = useFileIO()

    // State to hold the list of all active sessions (viewable by 'main')
    const appSessions = useState<AppSession[]>('app.sessions', () => []);
    const lastOpenedSession = useState<string | undefined>('app.sessions.lastOpened')

    // State to hold the session data SPECIFIC to the current running window
    const currentAppSession = useState<AppSession | null>('app.sessions.current', () => null);

    /**
     * Adds a new session to the list and persists it.
     * Ideally called by 'main' right before or after creating a new window.
     */
    async function addAppSession(sesh: AppSession, updateStore: boolean = true) {
        if (updateStore) await load(); // Sync with latest disk state

        // Prevent duplicates by ID
        if (!appSessions.value.find(s => s.uuid === sesh.uuid)) {
            appSessions.value.push(sesh);
            if (updateStore) await save();
        }
        return sesh;
    }

    /**
     * Removes a session from the tracker and updates the store.
     * Call this when a window is closed.
     */
    async function removeAppSession(sessionId: PossiblyRef<string>) {
        const id = unref(sessionId);
        await load(); // Ensure we have the latest list before filtering

        appSessions.value = appSessions.value.filter(i => i.uuid !== id);
        await save();
    }

    /**
     * Updates an existing session's data (e.g., changing the active tab, saving window position).
     * Can be called by the `main` window or the specific `session-` window updating itself.
     */
    async function updateAppSession(
        sessionId: PossiblyRef<string>,
        partialSession: Partial<AppSession>,
        updateStore: boolean = true
    ) {
        const id = unref(sessionId);

        if (updateStore) {
            await load(); // Reload to avoid overwriting updates from other windows
        }

        const index = appSessions.value.findIndex(s => s.uuid === id);
        if (index !== -1) {
            // Merge existing data with new data
            appSessions.value[index] = defaultAppSession({
                ...appSessions.value[index],
                ...partialSession
            });

            // If we are updating the current session of THIS window, update that local state too
            if (currentAppSession.value && currentAppSession.value.uuid === id) {
                currentAppSession.value = appSessions.value[index];
            }

            await save();
        } else {
            console.warn(`[useActiveWindowSessions] Tried to update non-existent session: ${id}`);
        }
    }

    /**
     * Retrieving a session from the local state list.
     */
    async function getAppSession(sessionId: PossiblyRef<string>, updateStore: boolean = true): Promise<AppSession | undefined> {
        if (updateStore) {
            await load(); // Reload to avoid overwriting updates from other windows
        }

        return unref(appSessions).find(i => i.uuid == unref(sessionId));
    }

    /**
     * Retrieving a session from the local state list.
     */
    async function getAppSessionFromAbsolutePath(absoluteFilePath: PossiblyRef<string>, updateStore: boolean = true): Promise<AppSession | undefined> {
        if (updateStore) {
            await load(); // Reload to avoid overwriting updates from other windows
        }

        return unref(appSessions).find(i => i.rootFileOrFolderAbsolutePath == unref(absoluteFilePath));
    }

    async function hasAppSessionWithId(sessionId: PossiblyRef<string>, updateStore: boolean = true) {
        if (updateStore) {
            await load(); // Reload to avoid overwriting updates from other windows
        }

        return unref(appSessions).findIndex(i => i.uuid == unref(sessionId)) != -1;
    }

    async function hasAppSessionWithRootPath(absoluteFilePath: PossiblyRef<string>, updateStore: boolean = true) {
        if (updateStore) {
            await load(); // Reload to avoid overwriting updates from other windows
        }

        return unref(appSessions).findIndex(i => i.rootFileOrFolderAbsolutePath == unref(absoluteFilePath)) != -1;
    }

    /**
     * Loads the sessions from the on-disk JSON store into the reactive state.
     * Automatically sanitizes sessions to remove duplicates and invalid entries.
     */
    async function load() {
        await store.init();

        if (!(await store.has('data'))) {
            await store.set('data', { openedSessions: [] } as AppSessionsStore);
        }

        const data = await store.get<AppSessionsStore>('data');
        if (!data) {
            // Fallback if data is corrupted or null
            await store.set('data', { openedSessions: [] } as AppSessionsStore);
            appSessions.value = [];
        } else {
            // Sort sessions by lastUpdated (most recent first)
            // Sessions without lastUpdated are treated as oldest (0)
            const sessions = data.openedSessions || [];
            appSessions.value = sessions.sort((a, b) => {
                const aTime = a?.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
                const bTime = b?.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
                return bTime - aTime; // Descending order (newest first)
            });
            lastOpenedSession.value = data.lastOpenedSession
            
            // Automatically sanitize sessions after loading
            await sanitizeAppSessions();
        }
    }

    /**
     * Writes the current reactive states to disk.
     */
    async function save() {
        await store.set('data', {
            openedSessions: unref(appSessions),
            lastOpenedSession: unref(lastOpenedSession)
        } satisfies AppSessionsStore);
        await store.save(); // Crucial: actually writes to the file system
    }

    /**
     * Identifies which session belongs to the currently executing code.
     * This relies on the window Label convention: "session-{uuid}"
     * @returns Returns `null` if the current window is not a `session-` window.
     */
    async function initializeCurrentAppSession() {
        // 1. Get the current Tauri window
        await load(); // Ensure store is loaded first

        // Adjust split logic if your UUID logic differs
        if ($win.isCurrentAppWindowSession()) {
            const uuidFromLabel = $win.getCurrentAppWindowSessionIdFromLabel() || ''

            const found = await getAppSession(uuidFromLabel);
            if (found) {
                currentAppSession.value = found;
                return found
            } else {
                console.error(`[useActiveWindowSessions] Current session window ID is ${uuidFromLabel} but no matching session found in store.`);
            }
        } else {
            // For other non-session windows, give null
            currentAppSession.value = null;
            return;
        }
    }

    /**
     * Sanitizes the app sessions by:
     * 1. Removing duplicates (same rootPath + same sessionType)
     * 2. Removing sessions with missing/invalid paths
     * 
     * When duplicates are found, keeps the first occurrence and removes the rest.
     * This is called automatically during loadAppSessions().
     * 
     * @returns The number of sessions removed
     */
    async function sanitizeAppSessions(): Promise<number> {
        const sessions = unref(appSessions);
        const seen = new Map<string, AppSession>();
        const toKeep: AppSession[] = [];
        let removedCount = 0;

        for (const session of sessions) {
            // Skip sessions with invalid data
            if (!session.rootFileOrFolderAbsolutePath || !session.sessionType || !session.uuid) {
                console.warn('[useAppSessions] Removing session with missing required fields:', session);
                removedCount++;
                continue;
            }

            // Create a unique key based on path + type
            const key = `${session.sessionType}:${session.rootFileOrFolderAbsolutePath}`;

            if (seen.has(key)) {
                // Duplicate found - skip it
                console.warn(
                    `[useAppSessions] Removing duplicate session:`,
                    `\n  - Type: ${session.sessionType}`,
                    `\n  - Path: ${session.rootFileOrFolderAbsolutePath}`,
                    `\n  - UUID: ${session.uuid}`,
                    `\n  - Keeping: ${seen.get(key)?.uuid}`
                );
                removedCount++;
            } else {
                // First occurrence - keep it
                seen.set(key, session);
                toKeep.push(session);
            }
        }

        // Update the sessions if any were removed
        if (removedCount > 0) {
            console.log(`[useAppSessions] Sanitization complete: Removed ${removedCount} duplicate/invalid session(s)`);
            appSessions.value = toKeep;
            await save();
        }

        return removedCount;
    }

    async function updateLastOpenedSession(session: AppSession) {

    }

    /**
     * Recovers all saved app session windows on app startup.
     * Currently only recovers workspace sessions. Only runs on the main window.
     */
    async function recoverSavedAppSessions() {
        await load()
        if (!($win.isCurrentAppWindowMain())) return
        if (unref(appSessions).length <= 0) return;

        for (const sesh of unref(appSessions)) {
            if (sesh.sessionType == 'workspace' && sesh.rootFileOrFolderAbsolutePath)
                await createWindowFromAppSession(sesh, false)
        }

        await $win.hideMainWindow()
    }

    function getCurrentAppSession() {
        return unref(currentAppSession);
    }

    async function createWindowFromAppSession(session: AppSession, hideMainWindow: PossiblyRef<boolean> = true) {
        if (!session) return;
        if (!session.rootFileOrFolderAbsolutePath) return;

        const windowTitle = await $fio.getFileNameFromPath(session.rootFileOrFolderAbsolutePath, false)
        const window = $win.createAppWebviewWindow('/loading', `session-${session.uuid}`, windowTitle)

        if (unref(hideMainWindow)) {
            await $win.hideMainWindow()
        }

        return window
    }

    async function getWebviewWindowWithAppSession(appSession: PossiblyRef<AppSession>, updateStore: boolean = true) {
        if (updateStore) {
            await load(); // Reload to avoid overwriting updates from other windows
        }

        return await $win.getAppWindowWithLabel(`session-${unref(appSession).uuid}`)
    }

    return {
        appSessions,
        currentAppSession,
        addAppSession,
        removeAppSession,
        updateAppSession,
        getAppSession,
        hasAppSessionWithId,
        load,
        save,
        sanitizeAppSessions,
        initializeCurrentAppSession,
        getCurrentAppSession,
        recoverSavedAppSessions,
        createWindowFromAppSession,
        hasAppSessionWithRootPath,
        getAppSessionFromAbsolutePath,
        getWebviewWindowWithAppSession
    }
}