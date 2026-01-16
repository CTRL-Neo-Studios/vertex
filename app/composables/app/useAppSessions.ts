import type { PossiblyRef } from "#shared/types/types";
import { LazyStore } from "@tauri-apps/plugin-store";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useFileIO} from "~/composables/io/useFileIO";
import type {AppSession} from "#shared/types/app/sessions";
import {defaultAppSession} from "#shared/utils/defaults/apps";

interface AppSessionsStore {
    openedSessions: AppSession[]
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

    // State to hold the session data SPECIFIC to the current running window
    const currentAppSession = useState<AppSession | null>('app.sessions.current', () => null);

    /**
     * Adds a new session to the list and persists it.
     * Ideally called by 'main' right before or after creating a new window.
     */
    async function addAppSession(sesh: AppSession, updateStore: boolean = true) {
        if (updateStore) await loadAppSessions(); // Sync with latest disk state

        // Prevent duplicates by ID
        if (!appSessions.value.find(s => s.uuid === sesh.uuid)) {
            appSessions.value.push(sesh);
            if (updateStore) await saveAppSessions();
        }
        return sesh;
    }

    /**
     * Removes a session from the tracker and updates the store.
     * Call this when a window is closed.
     */
    async function removeAppSession(sessionId: PossiblyRef<string>) {
        const id = unref(sessionId);
        await loadAppSessions(); // Ensure we have the latest list before filtering

        appSessions.value = appSessions.value.filter(i => i.uuid !== id);
        await saveAppSessions();
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
            await loadAppSessions(); // Reload to avoid overwriting updates from other windows
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

            await saveAppSessions();
        } else {
            console.warn(`[useActiveWindowSessions] Tried to update non-existent session: ${id}`);
        }
    }

    /**
     * Retrieving a session from the local state list.
     */
    async function getAppSession(sessionId: PossiblyRef<string>, updateStore: boolean = true): Promise<AppSession | undefined> {
        if (updateStore) {
            await loadAppSessions(); // Reload to avoid overwriting updates from other windows
        }

        return unref(appSessions).find(i => i.uuid == unref(sessionId));
    }

    async function hasAppSessionWithId(sessionId: PossiblyRef<string>, updateStore: boolean = true) {
        if (updateStore) {
            await loadAppSessions(); // Reload to avoid overwriting updates from other windows
        }

        return unref(appSessions).findIndex(i => i.uuid == unref(sessionId)) != -1;
    }

    /**
     * Loads the sessions from the on-disk JSON store into the reactive state.
     */
    async function loadAppSessions() {
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
            appSessions.value = data.openedSessions || [];
        }
    }

    /**
     * Writes the current reactive state to disk.
     */
    async function saveAppSessions() {
        await store.set('data', {
            openedSessions: unref(appSessions)
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
        const currentWindow = await $win.getCurrentAppWindow();
        const label = currentWindow.label;

        // 2. Main window doesn't have a "session", usually.
        if (!(await $win.isCurrentAppWindowMain())) {
            currentAppSession.value = null;
            return;
        }

        // 3. For session windows, extract UUID and find in store
        await loadAppSessions(); // Ensure store is loaded first

        // Assuming label format: "session-UUID-HERE"
        // Adjust split logic if your UUID logic differs
        if (label.startsWith('session-')) {
            const uuidFromLabel = label.replace('session-', '');

            const found                                                                                                                                                                       = await getAppSession(uuidFromLabel);
            if (found) {
                currentAppSession.value = found;
                return found
            } else {
                console.error(`[useActiveWindowSessions] Current window label is ${label} but no matching session found in store.`);
            }
        }
    }

    /**
     * Recovers all saved app session windows on app startup.
     * Currently only recovers workspace sessions. Only runs on the main window.
     */
    async function recoverSavedAppSessions() {
        await loadAppSessions()
        if (!(await $win.isCurrentAppWindowMain())) return
        if (unref(appSessions).length <= 0) return;

        for (const sesh of unref(appSessions)) {
            if (sesh.sessionType == 'workspace' && sesh.rootFileOrFolderAbsolutePath)
                $win.createAppWebviewWindow('/loading', `session-${sesh.uuid}`, await $fio.getFileNameFromPath(sesh.rootFileOrFolderAbsolutePath, true))
        }

        const w = await $win.getCurrentAppWindow()
        await w.hide()
    }

    function getCurrentAppSession() {
        return unref(currentAppSession);
    }

    return {
        appSessions,
        currentAppSession,
        addAppSession,
        removeAppSession,
        updateAppSession,
        getAppSession,
        hasAppSessionWithId,
        loadAppSessions,
        saveAppSessions,
        initializeCurrentAppSession,
        getCurrentAppSession,
        recoverSavedAppSessions
    }
}