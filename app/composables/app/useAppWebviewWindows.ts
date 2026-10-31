import {getAllWebviewWindows, WebviewWindow, getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";
import {LogicalPosition} from "@tauri-apps/api/dpi";
import {sessionUuidFromLabel, WindowLabel} from "#shared/constants/app";

/**
 * Finding and creating webview windows. No session logic here; main-window visibility is owned by Rust
 * (`sync_main_visibility` in src-tauri/src/lib.rs).
 */
export function useAppWebviewWindows() {
    function getCurrentAppWindow(): WebviewWindow {
        return getCurrentWebviewWindow()
    }

    function createAppWebviewWindow(route: string, label: string, titleSuffix?: string, options?: {width?: number, height?: number, resizable?: boolean, title?: string}) {
        const {width = 900, height = 600, resizable = true, title} = options ?? {}
        return new WebviewWindow(label, {
            url: route,
            decorations: true,
            center: true,
            transparent: true,
            width,
            height,
            resizable,
            title: title ?? (titleSuffix ? `Vertex - ${titleSuffix}` : "Vertex"),
            hiddenTitle: true,
            titleBarStyle: 'overlay',
            trafficLightPosition: new LogicalPosition(14, 21),
        })
    }

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
        createAppWebviewWindow,
        getAppWindowWithLabel,
        showWindowWithLabel,
        isCurrentAppWindowMain: () => getCurrentAppWindow().label === WindowLabel.main,
        isCurrentAppWindowSession: () => getCurrentAppWindow().label.startsWith(WindowLabel.sessionPrefix),
        getCurrentAppWindowSessionIdFromLabel: () => sessionUuidFromLabel(getCurrentAppWindow().label),
    }
}
