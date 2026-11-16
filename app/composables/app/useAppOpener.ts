import { openUrl, openPath, revealItemInDir } from "@tauri-apps/plugin-opener"

export function useAppOpener() {
    /**
     * Opens a web or mail link in the default app. Anything else is refused: links come from notes, diagrams, bases
     * and chats, and a `file:` or an app's own scheme would launch whatever the system maps it to.
     */
    async function openUrlInBrowser(url: string) {
        if (!/^(https?|mailto):/i.test(url.trim())) return
        await openUrl(url)
    }

    async function openFileWithDefaultApp(absoluteFilePath: PossiblyRef<string>) {
        await openPath(unref(absoluteFilePath))
    }

    async function revealFilesInFileManager(absoluteFilePaths: PossiblyRef<string[]>) {
        await revealItemInDir(unref(absoluteFilePaths))
    }

    return {
        openUrlInBrowser,
        openFileWithDefaultApp,
        revealFilesInFileManager
    }
}