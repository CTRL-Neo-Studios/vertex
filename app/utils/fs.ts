import {exists, remove, rename, stat} from "@tauri-apps/plugin-fs";
import {basename, dirname, join} from "@tauri-apps/api/path";

/** Renames/moves `from` to `to`; refuses to overwrite, but allows case-only renames on case-insensitive disks. */
async function relocate(from: string, to: string) {
    if (from.toLowerCase() !== to.toLowerCase() && await exists(to)) throw new Error(`"${to}" already exists.`)
    await rename(from, to)
    return to
}

/** Renames in place. A file keeps its extension when `newName` has none. Returns the new path. */
export async function renamePath(path: string, newName: string) {
    newName = newName.trim()
    if (!newName) throw new Error('A new name is required.')
    const old = await basename(path)
    const dot = old.lastIndexOf('.')
    if (dot > 0 && newName.lastIndexOf('.') <= 0 && (await stat(path)).isFile) newName += old.slice(dot)
    return relocate(path, await join(await dirname(path), newName))
}

/** Moves into `destDir`, keeping the name. Returns the new path. */
export async function movePath(path: string, destDir: string) {
    return relocate(path, await join(destDir, await basename(path)))
}

/** Deletes a file or folder (recursively); a missing path is not an error. */
export async function removePath(path: string) {
    if (await exists(path)) await remove(path, {recursive: true})
}
