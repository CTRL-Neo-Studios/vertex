/**
 * A workspace's badge, as JetBrains draws a project's: the first letters of its folder name's first and last words
 * (`tauri-updater-backend` → TB, `vertex` → V), on a colour hashed from its path, so it stays the same everywhere.
 */
export function workspaceBadge(path: string): { initials: string, hue: number } {
    const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
    const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    const initials = words.length > 1 ? words[0]![0]! + words.at(-1)![0]! : words[0]?.[0] ?? '?'
    let hash = 0
    for (const char of path) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
    return {initials: initials.toUpperCase(), hue: hash % 360}
}
