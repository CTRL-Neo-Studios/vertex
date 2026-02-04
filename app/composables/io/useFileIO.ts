import type {PossiblyRef} from "#shared/types/types";
import {
    copyFile,
    exists,
    mkdir,
    readDir,
    readFile,
    readTextFile,
    remove,
    rename,
    stat,
    writeTextFile,
    create, FileHandle
} from "@tauri-apps/plugin-fs";
import {basename, dirname, join} from "@tauri-apps/api/path";

export function useFileIO() {
    /**
     * Reads UTF-8 text from file.
     */
    async function readTextFromFile(fullPathRef: PossiblyRef<string | undefined>): Promise<string> {
        const fullPath = unref(fullPathRef);
        if (!fullPath) return '';
        return await readTextFile(fullPath);
    }

    /**
     * Writes UTF-8 text to file (overwrites).
     */
    async function writeTextToFile(
        fullPathRef: PossiblyRef<string | undefined>,
        dataRef: PossiblyRef<string | undefined>
    ): Promise<void> {
        const fullPath = unref(fullPathRef);
        const data = unref(dataRef);

        if (!fullPath || !data) return;
        await writeTextFile(fullPath, data);
    }

    async function createFile(
        fullPathRef: PossiblyRef<string | undefined>
    ): Promise<FileHandle | undefined> {
        const fullPath = unref(fullPathRef)

        if (!fullPath) return;
        return await create(fullPath)
    }

    /**
     * Renames a file or folder. Preserves file extension if the new name doesn't have one.
     * @param fullPathRef Original full path.
     * @param newNameRef New name (with or without extension).
     * @returns New full path after rename.
     */
    async function renameFileOrFolder(
        fullPathRef: PossiblyRef<string | undefined>,
        newNameRef: PossiblyRef<string | undefined>
    ): Promise<string> {
        const fullPath = unref(fullPathRef);
        const newName = unref(newNameRef)?.trim(); // Trim whitespace

        if (!fullPath || !newName) {
            throw new Error("Full path and new name are required.");
        }

        const dir = await dirname(fullPath);
        let finalNewName = newName;

        try {
            const stats = await stat(fullPath);

            // FIX: Robustly preserve file extension if it's a file and the new name lacks an extension.
            if (stats.isFile) {
                const currentBase = await basename(fullPath);
                const currentExtIndex = currentBase.lastIndexOf('.');
                const newNameHasExt = newName.lastIndexOf('.') > 0;

                // If original has an extension (e.g., 'file.txt', not '.env') and new name doesn't...
                if (currentExtIndex > 0 && !newNameHasExt) {
                    const currentExt = currentBase.substring(currentExtIndex); // e.g., ".txt"
                    finalNewName = `${newName}${currentExt}`;
                }
            }
        } catch (e) {
            // If stat fails, the file likely doesn't exist. Proceed with caution or throw.
            // For rename, it's safer to throw.
            throw new Error(`Cannot stat original path: ${fullPath}. It may not exist.`);
        }

        const newPath = await join(dir, finalNewName);

        // BUGFIX: Prevent error when only changing character case on case-insensitive filesystems (e.g., file.txt -> File.txt).
        if (fullPath.toLowerCase() === newPath.toLowerCase()) {
            // This is a case-only rename. We can proceed, but Tauri's `rename` might still
            // rely on a temp file on some platforms. A simple rename should work for most.
        } else if (await exists(newPath)) {
            // If it's a different path and it already exists, throw an error.
            throw new Error(`Cannot rename: Destination "${newPath}" already exists.`);
        }

        await rename(fullPath, newPath);
        console.log(`[FileIO] Renamed "${fullPath}" → "${newPath}"`);
        return newPath;
    }

    /**
     * Moves a file or folder to a new directory, optionally renaming it.
     */
    async function moveFileOrFolder(
        sourcePathRef: PossiblyRef<string>,
        destDirRef: PossiblyRef<string>,
        newNameRef?: PossiblyRef<string>
    ): Promise<string> {
        const source = unref(sourcePathRef);
        const destDir = unref(destDirRef);
        const newName = newNameRef ? unref(newNameRef) : await basename(source);

        const newPath = await join(destDir, newName);

        // BUGFIX: Allow moving a file into a directory where a file with different casing exists.
        if (source.toLowerCase() !== newPath.toLowerCase() && await exists(newPath)) {
            throw new Error(`Cannot move: Destination "${newPath}" already exists.`);
        }

        // Ensure destination directory exists.
        if (!(await exists(destDir))) {
            await mkdir(destDir, { recursive: true });
        }

        await rename(source, newPath);
        console.log(`[FileIO] Moved "${source}" → "${newPath}"`);
        return newPath;
    }

    /**
     * Deletes a file or folder (recursively for folders).
     */
    async function deleteFileOrFolder(fullPathRef: PossiblyRef<string>): Promise<void> {
        const fullPath = unref(fullPathRef);
        // Safety check to prevent deleting nothing (which doesn't error but is weird)
        if (await exists(fullPath)) {
            await remove(fullPath, { recursive: true });
            console.log(`[FileIO] Deleted: ${fullPath}`);
        } else {
            console.warn(`[FileIO] Attempted to delete a non-existent path: ${fullPath}`);
        }
    }

    /**
     * Copies a file. If destination is a directory, copies the file into it.
     */
    async function copyFileTo(
        sourcePathRef: PossiblyRef<string>,
        destPathRef: PossiblyRef<string>
    ): Promise<string> {
        const source = unref(sourcePathRef);
        let dest = unref(destPathRef);

        // IMPROVEMENT: Handle case where destination is a directory.
        let destIsDirectory = false;
        try {
            if (await exists(dest)) {
                const destStats = await stat(dest);
                destIsDirectory = destStats.isDirectory;
            }
        } catch {/* ignore */}

        if (destIsDirectory || dest.endsWith('/') || dest.endsWith('\\')) {
            const sourceBaseName = await basename(source);
            dest = await join(dest, sourceBaseName);
        }

        if (source.toLowerCase() === dest.toLowerCase()) {
            throw new Error("Cannot copy a file to itself.");
        }

        // Ensure destination directory exists.
        const destDir = await dirname(dest);
        if (!(await exists(destDir))) {
            await mkdir(destDir, { recursive: true });
        }

        await copyFile(source, dest);
        console.log(`[FileIO] Copied "${source}" → "${dest}"`);
        return dest; // Return the final path
    }

    // ... The rest of your functions are solid, but let's include them for completeness ...

    async function createFolder(fullPathRef: PossiblyRef<string>): Promise<void> {
        const fullPath = unref(fullPathRef);
        await mkdir(fullPath, { recursive: true });
        console.log(`[FileIO] Created folder: ${fullPath}`);
    }

    async function pathExists(fullPathRef: PossiblyRef<string>): Promise<boolean> {
        const fullPath = unref(fullPathRef);
        return await exists(fullPath);
    }

    async function getFileInfo(fullPathRef: PossiblyRef<string>) {
        const fullPath = unref(fullPathRef);
        return await stat(fullPath);
    }

    async function listDirectory(fullPathRef: PossiblyRef<string>) {
        const fullPath = unref(fullPathRef);
        return await readDir(fullPath);
    }

    async function getFileNameFromPath(pathRef: PossiblyRef<string>, omitExtension: boolean = false): Promise<string> {
        const path = unref(pathRef);
        let fileName = await basename(path);

        if (omitExtension) {
            const lastDotIndex = fileName.lastIndexOf('.');
            if (lastDotIndex > 0) { // Ensures we don't slice for ".env" type files
                fileName = fileName.slice(0, lastDotIndex);
            }
        }
        return fileName;
    }

    function processFileNameFromPath(path: string, omitExtension: boolean = false): string {
        if (!path) return "";
        const normalized = path.replace(/\\/g, '/');
        let fileName = normalized.split('/').pop() || path;

        if (omitExtension) {
            const lastDotIndex = fileName.lastIndexOf('.');
            if (lastDotIndex > 0) {
                fileName = fileName.slice(0, lastDotIndex);
            }
        }
        return fileName;
    }

    /**
     * Finds the nearest parent directory of a given path (async version).
     * @param pathRef The path to find the parent for (absolute or relative).
     * @param defaultReturn The value to return when there's no parent (e.g., root directory). Defaults to "/".
     * @returns The parent directory path, or defaultReturn if no parent exists.
     */
    async function getParentDirectory(
        pathRef: PossiblyRef<string>,
        defaultReturn: string = "/"
    ): Promise<string> {
        const path = unref(pathRef);
        if (!path) return defaultReturn;

        const parent = await dirname(path);
        
        // If dirname returns the same path, we're at the root or have no parent
        if (parent === path || parent === "." || parent === "") {
            return defaultReturn;
        }

        return parent;
    }

    /**
     * Finds the nearest parent directory of a given path (synchronous, performant version).
     * @param pathRef The path to find the parent for (absolute or relative).
     * @param defaultReturn The value to return when there's no parent (e.g., root directory). Defaults to "/".
     * @returns The parent directory path, or defaultReturn if no parent exists.
     */
    function getParentDirectorySync(
        pathRef: PossiblyRef<string>,
        defaultReturn: string = "/"
    ): string {
        let path = unref(pathRef);
        if (!path) return defaultReturn;

        // Normalize path separators to forward slashes
        path = path.replace(/\\/g, '/');

        // Remove trailing slashes
        while (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        // Handle root cases
        if (path === '/' || path === '') {
            return defaultReturn;
        }

        // Find last separator
        const lastSeparatorIndex = path.lastIndexOf('/');
        
        // No separator found (relative path with no parent)
        if (lastSeparatorIndex === -1) {
            return defaultReturn;
        }

        // Root directory case (e.g., "/Users" -> "/")
        if (lastSeparatorIndex === 0) {
            return '/';
        }

        // Return everything before the last separator
        return path.slice(0, lastSeparatorIndex);
    }

    return {
        readTextFromFile,
        writeTextToFile,
        renameFileOrFolder,
        deleteFileOrFolder,
        copyFileTo,
        createFolder,
        pathExists,
        getFileInfo,
        listDirectory,
        moveFileOrFolder,
        getFileNameFromPath,
        processFileNameFromPath,
        getParentDirectory,
        getParentDirectorySync,
        createFile
    }
}