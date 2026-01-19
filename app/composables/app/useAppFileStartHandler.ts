import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";

export function useAppFileStartHandler() {
    const $win = useAppWebviewWindows()
    const $act = useAppSessionActions()

    async function initializeOnMain() {
        if (!$win.isCurrentAppWindowMain()) return;

        let handledPath: string | null = null;

        // --- 1. SET UP LISTENER (Warm Start & Late Cold Start) ---
        // Start listening immediately
        const unlisten = await listen<string>('open-file', async (event) => {
            const filePath = event.payload;
            console.log("[JS] Warm File Startup Event Received:", filePath);

            // Deduplicate logic is already handled via the actions composable.
            // if (handledPath === filePath) return;

            handledPath = filePath;

            // Run actual logic
            console.log(`Windows: ${await $win.getAppWindows()}`)
            await $act.openSinglespaceFromPath(filePath)
        });

        // --- 2. CHECK COMMAND (Early Cold Start) ---
        // Check if Rust already caught the file before we loaded
        const startupFile = await invoke<string | null>('get_startup_file');
        if (startupFile) {
            console.log("[JS] Cold File Startup Command Received:", startupFile);

            if (handledPath !== startupFile) {
                handledPath = startupFile;

                // Run actual logic
                console.log(`Windows: ${await $win.getAppWindows()}`)
                await $act.openSinglespaceFromPath(startupFile)
            }
        }
    }

    return {
        initializeOnMain
    }
}