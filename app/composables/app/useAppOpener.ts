import { openUrl, openPath, revealItemInDir } from "@tauri-apps/plugin-opener"

export function useAppOpener() {
    async function openUrlInBrowser(url: string) {
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