import { openUrl, openPath } from "@tauri-apps/plugin-opener"
import { vertexInvoke } from "~/utils/vertexInvoke"

/**
 * Opens a web or mail link in the default app. Anything else is refused: links come from notes, diagrams, bases
 * and chats, and a `file:` or an app's own scheme would launch whatever the system maps it to. Plugins get it as
 * `openExternal` (`app/plugin/ui`).
 */
export async function openUrlInBrowser(url: string) {
    if (!/^(https?|mailto):/i.test(url.trim())) return
    await openUrl(url)
}

export function useAppOpener() {
    async function openFileWithDefaultApp(absoluteFilePath: PossiblyRef<string>) {
        await openPath(unref(absoluteFilePath))
    }

    /** Through the kernel: only what this window reaches (the opener's own command checks no scope). */
    async function revealFilesInFileManager(absoluteFilePaths: PossiblyRef<string[]>) {
        await vertexInvoke('reveal_paths', {paths: unref(absoluteFilePaths)})
    }

    return {
        openUrlInBrowser,
        openFileWithDefaultApp,
        revealFilesInFileManager
    }
}
