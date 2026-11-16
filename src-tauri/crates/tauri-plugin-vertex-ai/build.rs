/// Every command, so `tauri_plugin` generates its `allow-`/`deny-` permissions (keep in sync with `init`).
const COMMANDS: &[&str] = &["ai_key_set", "ai_key_has", "ai_request", "ai_request_cancel", "ai_model_catalog"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
