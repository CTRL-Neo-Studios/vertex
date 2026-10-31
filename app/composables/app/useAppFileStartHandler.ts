import {stat} from "@tauri-apps/plugin-fs";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {stateClient} from "~/utils/stateClient";

/**
 * Opens every path the OS hands us (file associations, Finder "Open With", second launches).
 * Rust queues paths and pings `open-requested`; the main window drains the queue on startup and on
 * each ping, so paths delivered before the webview was ready are not lost.
 */
export function useAppFileStartHandler() {
    const $win = useAppWebviewWindows()
    const $act = useAppSessionActions()

    let draining: Promise<void> = Promise.resolve()

    async function drain() {
        for (const path of await stateClient.takeOpenRequests()) {
            try {
                const info = await stat(path)
                await (info.isDirectory ? $act.openWorkspaceFromPath(path) : $act.openSinglespaceFromPath(path))
            } catch (e) {
                console.error(`[useAppFileStartHandler] could not open ${path}`, e)
            }
        }
    }

    async function initializeOnMain() {
        if (!$win.isCurrentAppWindowMain()) return
        const unlisten = await stateClient.onOpenRequested(() => {
            draining = draining.then(drain)
        })
        draining = draining.then(drain)
        await draining
        return unlisten
    }

    return {initializeOnMain}
}
