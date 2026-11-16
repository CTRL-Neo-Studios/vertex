use std::path::Path;

fn main() {
    core_plugins();
    tauri_build::build()
}

/// `$OUT_DIR/core_plugins.rs`: every `layers/<id>/plugin.json`, embedded, so Rust knows each core plugin's windows,
/// default and permissions without asking a webview (`modules/core-plugins.ts` validates the same files).
fn core_plugins() {
    // `layers/` always exists (`.gitkeep`): Cargo reruns a build script on every build while a watched path is missing.
    println!("cargo:rerun-if-changed=../layers");
    let mut files: Vec<_> = std::fs::read_dir("../layers")
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path().join("plugin.json"))
        .filter(|file| file.is_file())
        .collect();
    files.sort();
    let entries: String = files
        .iter()
        .map(|file| format!("    include_str!({:?}),\n", file.canonicalize().expect("a plugin.json")))
        .collect();
    let out = Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("core_plugins.rs");
    std::fs::write(out, format!("&[\n{entries}]\n")).expect("core_plugins.rs");
}
