/// Every command, so `tauri_plugin` generates its `allow-`/`deny-` permissions (keep in sync with `init`).
const COMMANDS: &[&str] = &[
    "chat_vault_state",
    "chat_vault_create",
    "chat_vault_unlock",
    "chat_vault_lock",
    "chat_vault_change",
    "chat_index",
    "chat_read",
    "chat_write",
    "chat_delete",
    "chat_folders_set",
    "chat_folder_rename",
    "chat_folder_delete",
    "chat_search",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
