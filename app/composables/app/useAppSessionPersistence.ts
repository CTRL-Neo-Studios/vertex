import type {ActiveSession} from "#shared/types/active/sessions";
import type {AppSessionContext} from "#shared/types/app/sessions";
import {StateKey} from "#shared/constants/app";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {stateClient} from "~/utils/stateClient";

/**
 * Keeps this window's AppSession in sync with its runtime state (open tabs, focused tab, expanded folders).
 *
 * State is written whenever it changes (debounced), not on close. Closing therefore only has to wait for
 * the last pending write, and can never persist an already-cleared tab list. Call during layout setup.
 */
export function useAppSessionPersistence(session: ActiveSession) {
    const $asesh = useAppSessions()
    const $win = useAppWebviewWindows()
    const {tabs, activeTabUuid} = useActiveTabs(session)
    const expandedFolders = useState<string[]>(StateKey.expandedFolders(session.uuid), () => [])
    const pathOf = session.workspaceSession
        ? useActiveWorkspaceIndex(session).getFileByUuid
        : useActiveSinglespaceIndex(session).getFileByUuid

    function snapshot(): AppSessionContext {
        const paths = (uuids: (string | null | undefined)[]) =>
            uuids.map(u => pathOf(u ?? undefined)?.fullPath).filter((p): p is string => !!p)
        return {
            openedAbsoluteFilePaths: paths(unref(tabs).map(t => t.fileUuid)),
            openedAbsoluteFolderPaths: session.workspaceSession ? paths(unref(expandedFolders)) : [],
            lastFocusedAbsoluteFilePath: paths([unref(activeTabUuid)])[0],
        }
    }

    let pending: Promise<void> = Promise.resolve()
    let lastWritten = ''
    // Set once the window starts closing so teardown (clearTabs/clearIndex) cannot overwrite the saved state.
    let frozen = false

    function persist() {
        const appSession = $asesh.getCurrentAppSession()
        if (frozen || !appSession) return pending
        const context = snapshot()
        const serialized = JSON.stringify(context)
        if (serialized === lastWritten) return pending
        lastWritten = serialized
        pending = pending
            .then(() => $asesh.updateAppSession(appSession.uuid, {context}))
            .catch(e => console.error('[useAppSessionPersistence] failed to persist session', e))
        return pending
    }

    const persistSoon = useDebounceFn(persist, 300)

    /** Begin tracking. Call after tabs have been restored so the restored state is not overwritten by an empty one. */
    function start() {
        watch([tabs, activeTabUuid, expandedFolders], () => persistSoon(), {deep: true})
    }
    /**
     * Single close path for session windows: flush the latest state, then let Tauri destroy the window.
     * Rust shows `main` when the last session window is destroyed. Also answers the quit handshake.
     * Returns one unlisten for both.
     */
    async function registerCloseHandlers() {
        const window = $win.getCurrentAppWindow()
        const unlistenClose = await window.onCloseRequested(async () => {
            await persist()
            frozen = true
        })
        const unlistenFlush = await stateClient.onFlushRequested(async () => {
            await persist()
            frozen = true
            await stateClient.flushDone(window.label)
        })
        return () => {
            unlistenClose()
            unlistenFlush()
        }
    }

    return {start, registerCloseHandlers}
}
