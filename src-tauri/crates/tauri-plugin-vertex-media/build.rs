/// Every command, so `tauri_plugin` generates its `allow-`/`deny-` permissions (keep in sync with `init`).
const COMMANDS: &[&str] = &["media_levels_listen", "media_levels_stop", "media_volume", "media_set_volume", "media_player", "media_command"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
