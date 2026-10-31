import {getAllWebviewWindows, WebviewWindow, getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";
import {sessionUuidFromLabel, WindowLabel} from "#shared/constants/app";

/*
This composable serves as a helper for creating or finding windows. It does not do any session management. For that, check on `useActiveWindowSessions`.
 */
export function useAppWebviewWindows() {
    const sessionWindowCount = computedAsync(
        async () => await getSessionWindows(),
        undefined
    )

    function getCurrentAppWindow(): WebviewWindow {
        return getCurrentWebviewWindow();
    }

    async function getAppWindows(): Promise<WebviewWindow[]> {
        return await getAllWebviewWindows()
    }

    async function getFocusedAppWindow() {
        const windows = await getAppWindows()
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
			resizable: true,
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
        const windows = await getAppWindows()
        return windows.find(i => i.label == unref(label))
    }

    async function getMainAppWindow() {
        return await getAppWindowWithLabel(WindowLabel.main)
    }

    function isCurrentAppWindowMain() {
        const window = getCurrentAppWindow()
        return window.label == WindowLabel.main
    }

    function isCurrentAppWindowSession() {
        const window = getCurrentAppWindow()
        return window.label.startsWith(WindowLabel.sessionPrefix)
    }

    function isCurrentAppWindowSettings() {
        const window = getCurrentAppWindow()
        return window.label == WindowLabel.settings
    }

    function getCurrentAppWindowSessionIdFromLabel(): string | undefined {
        return sessionUuidFromLabel(getCurrentAppWindow().label)
    }

    async function closeAllSessionWindows() {
        const windows = await getSessionWindows()
        for (const window of windows) {
            await window.close()
        }
    }

    async function closeAllSessionWindowsExceptCurrent() {
        const current = getCurrentAppWindow()
        const windows = (await getSessionWindows()).filter(w => w.label !== current.label)
        for (const window of windows) {
            await window.close()
        }
        return current
    }

    async function hideMainWindow() {
        const window = await getMainAppWindow()

        if (!window) return;

        await window.hide()
    }

    async function showMainWindow() {
        const window = await getMainAppWindow()

        if (!window) return;

        await window.unminimize()
        await window.show()

        return window;
    }

    async function showWindowWithLabel(label: string) {
        const window = await getAppWindowWithLabel(label)

        if (!window) return;

        await window.unminimize()
        await window.show()

        return window
    }

    async function hideWindowWithLabel(label: string) {
        const window = await getAppWindowWithLabel(label)

        if (!window) return;

        await window.hide()

        return window
    }

    async function getSessionWindows() {
        const windows = await getAppWindows()
        return windows.filter(i => i.label.startsWith(WindowLabel.sessionPrefix))
    }
    return {
        getCurrentAppWindow,
        getFocusedAppWindow,
        createAppWebviewWindow,
        getAppWindowWithLabel,
        getMainAppWindow,
        isCurrentAppWindowMain,
        isCurrentAppWindowSession,
        isCurrentAppWindowSettings,
        closeAllSessionWindows,
        closeAllSessionWindowsExceptCurrent,
        getAppWindows,
        hideMainWindow,
        showMainWindow,
        getSessionWindows,
        getCurrentAppWindowSessionIdFromLabel,
        showWindowWithLabel,
        hideWindowWithLabel,
        sessionWindowCount,
    }
}
