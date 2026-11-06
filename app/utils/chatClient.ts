import {invoke} from "@tauri-apps/api/core";
import type {ChatFile, ChatIndex, ChatStorage, ChatVaultState} from "#shared/types/app/chats";

/**
 * Thin client for the Rust chat store (src-tauri/src/chats.rs). Rust owns the files, the encryption and the
 * workspace's id (`.vertex/workspace.json`); the unlocked key never leaves Rust. `root` is the workspace root.
 */
export const ChatCommand = {
    vaultState: 'chat_vault_state',
    vaultCreate: 'chat_vault_create',
    vaultUnlock: 'chat_vault_unlock',
    vaultLock: 'chat_vault_lock',
    index: 'chat_index',
    read: 'chat_read',
    write: 'chat_write',
    delete: 'chat_delete',
    foldersSet: 'chat_folders_set',
    folderRename: 'chat_folder_rename',
    folderDelete: 'chat_folder_delete',
} as const

/** Error strings Rust returns for expected failures; anything else is an I/O or format error message. */
export const ChatError = {
    /** Workspace storage whose vault is `none` or `locked`. */
    locked: 'locked',
    wrongPassword: 'wrong-password',
    /** `vaultCreate` when a password is already set. */
    exists: 'exists',
} as const

export const chatClient = {
    vaultState: (root: string, storage: ChatStorage) => invoke<ChatVaultState>(ChatCommand.vaultState, {root, storage}),
    /** Sets the workspace password (first use) and unlocks; `remember` keeps the key in the OS keychain. */
    vaultCreate: (root: string, password: string, remember: boolean) => invoke(ChatCommand.vaultCreate, {root, password, remember}),
    vaultUnlock: (root: string, password: string, remember: boolean) => invoke(ChatCommand.vaultUnlock, {root, password, remember}),
    /** Forgets the key in memory and in the keychain. */
    vaultLock: (root: string) => invoke(ChatCommand.vaultLock, {root}),
    index: (root: string, storage: ChatStorage) => invoke<ChatIndex>(ChatCommand.index, {root, storage}),
    read: (root: string, storage: ChatStorage, id: string) => invoke<ChatFile>(ChatCommand.read, {root, storage, id}),
    /** Creates or replaces `chat.id` atomically. */
    write: (root: string, storage: ChatStorage, chat: ChatFile) => invoke(ChatCommand.write, {root, storage, chat}),
    delete: (root: string, storage: ChatStorage, id: string) => invoke(ChatCommand.delete, {root, storage, id}),
    /** Replaces the stored folder list (what keeps empty folders alive). */
    foldersSet: (root: string, storage: ChatStorage, folders: string[]) => invoke(ChatCommand.foldersSet, {root, storage, folders}),
    /** Renames a folder and its subfolders, rewriting the chats inside. */
    folderRename: (root: string, storage: ChatStorage, from: string, to: string) => invoke(ChatCommand.folderRename, {root, storage, from, to}),
    /** Deletes a folder, its subfolders and every chat inside them. */
    folderDelete: (root: string, storage: ChatStorage, path: string) => invoke(ChatCommand.folderDelete, {root, storage, path}),
}
