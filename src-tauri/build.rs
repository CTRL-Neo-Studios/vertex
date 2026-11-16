use std::path::Path;

fn main() {
    plugin_manifests();
    tauri_build::build()
}

/// `$OUT_DIR/plugins.rs`: the built-ins' manifests (`app/builtins/plugins.json`) and every `layers/<id>/plugin.json`,
/// embedded, so Rust knows each plugin's windows, default and permissions without asking a webview (the frontend
/// validates the same files).
fn plugin_manifests() {
    const BUILTINS: &str = "../app/builtins/plugins.json";
    println!("cargo:rerun-if-changed={BUILTINS}");
    // `layers/` always exists (`.gitkeep`): Cargo reruns a build script on every build while a watched path is missing.
    println!("cargo:rerun-if-changed=../layers");
    let mut layers: Vec<_> = std::fs::read_dir("../layers")
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path().join("plugin.json"))
        .filter(|file| file.is_file())
        .collect();
    layers.sort();
    let entries: String = std::iter::once(Path::new(BUILTINS).to_path_buf())
        .chain(layers)
        .map(|file| format!("    include_str!({:?}),\n", file.canonicalize().expect("a plugin manifest")))
        .collect();
    let out = Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("plugins.rs");
    std::fs::write(out, format!("&[\n{entries}]\n")).expect("plugins.rs");
}
