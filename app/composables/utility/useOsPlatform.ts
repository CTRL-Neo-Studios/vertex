import {platform} from "@tauri-apps/plugin-os"

export function useOsPlatform() {
    return platform()
}