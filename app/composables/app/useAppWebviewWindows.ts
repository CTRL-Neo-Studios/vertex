import {getAllWebviewWindows, getCurrentWebviewWindow, type WebviewWindow} from "@tauri-apps/api/webviewWindow";
import {sessionUuidFromLabel, WindowLabel} from "#shared/constants/app";
import {vertexInvoke} from "~/utils/vertexInvoke";

/**
 * A window a webview may ask the kernel for (`window_open`, `src-tauri/crates/tauri-plugin-vertex/src/windows.rs`):
 * only Rust creates windows, so their labels, and the capabilities that go with them, are the kernel's to give.
 */
export type AppWindowRequest =
    | { kind: 'session', uuid: string, title: string }
    | { kind: 'settings', path?: string, scope?: string | null }
    | { kind: 'about' }

/**
 * Finding and opening webview windows. No session logic here; the start window's visibility is the kernel's (it
 * shows it while no session window is open).
 */
export function useAppWebviewWindows() {
    function getCurrentAppWindow(): WebviewWindow {
        return getCurrentWebviewWindow()
    }

    /** Opens the window, or brings it forward when it's open already. */
    const openAppWindow = (request: AppWindowRequest) => vertexInvoke('window_open', {request})

    async function getAppWindowWithLabel(label: string) {
        return (await getAllWebviewWindows()).find(w => w.label === label)
    }

    async function showWindowWithLabel(label: string) {
        const window = await getAppWindowWithLabel(label)
        if (!window) return
        await window.unminimize()
        await window.show()
        await window.setFocus()
        return window
    }

    return {
        getCurrentAppWindow,
        openAppWindow,
        getAppWindowWithLabel,
        showWindowWithLabel,
        isCurrentAppWindowMain: () => getCurrentAppWindow().label === WindowLabel.main,
        isCurrentAppWindowSession: () => getCurrentAppWindow().label.startsWith(WindowLabel.sessionPrefix),
        getCurrentAppWindowSessionIdFromLabel: () => sessionUuidFromLabel(getCurrentAppWindow().label),
    }
}
