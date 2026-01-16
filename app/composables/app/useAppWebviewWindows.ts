import {getAllWebviewWindows, WebviewWindow, getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";

/*
This composable serves as a helper for creating or finding windows. It does not do any session management. For that, check on `useActiveWindowSessions`.
 */
export function useAppWebviewWindows() {
    async function getCurrentAppWindow(): Promise<WebviewWindow> {
        return getCurrentWebviewWindow();
    }

    async function getFocusedAppWindow() {
        const windows = await getAllWebviewWindows()
        for (const window of windows) {
            if (await window.isFocused()) return window
        }
    }

    function createAppWebviewWindow(defaultRoute: PossiblyRef<string>, label: PossiblyRef<string>, titleSuffix?: string) {
        return new WebviewWindow(unref(label), {
            url: unref(defaultRoute),
            decorations: true,
            center: true,
            transparent: true,
            width: 900,
            height: 600,
            title: titleSuffix ? `Vertex - ${titleSuffix}` : "Vertex",
            hiddenTitle: true,
            titleBarStyle: 'overlay',
            // @ts-ignore
            trafficLightPosition: {
                x: 14,
                y: 21
            }
        })
    }

    async function getAppWindowWithLabel(label: PossiblyRef<string>) {
        const windows = await getAllWebviewWindows()
        for (const window of windows) {
            if (window.label == unref(label)) return window
        }
    }

    async function getMainAppWindow() {
        return await getAppWindowWithLabel('main')
    }

    async function isCurrentAppWindowMain() {
        const window = await getCurrentAppWindow()
        return window.label == 'main'
    }

    return {
        getCurrentAppWindow,
        getFocusedAppWindow,
        createAppWebviewWindow,
        getAppWindowWithLabel,
        getMainAppWindow,
        isCurrentAppWindowMain
    }
}