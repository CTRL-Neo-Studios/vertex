import {getCurrentWindow, getAllWindows} from "@tauri-apps/api/window";
import {WebviewWindow} from "@tauri-apps/api/webviewWindow";

export function useAppWindows() {
    async function getCurrentAppWindow() {
        return getCurrentWindow();
    }

    async function getFocusedAppWindow() {
        const windows = await getAllWindows()
        for (const window of windows) {
            if (await window.isFocused()) return window
        }
    }

    async function createAppWindow(defaultRoute: string, windowId: string) {
        new WebviewWindow(`session-${newwindow}-window`, {
            url: '/',
            decorations: true,
            center: true,
            transparent: true,
            width: 900,
            height: 600,
            title: "Vertex",
            hiddenTitle: true,
            titleBarStyle: 'overlay',
            // @ts-ignore
            trafficLightPosition: {
                x: 14,
                y: 21
            }
        })
    }

    return {
        getCurrentAppWindow
    }
}