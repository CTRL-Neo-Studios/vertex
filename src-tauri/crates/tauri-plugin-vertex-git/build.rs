/// Every command, so `tauri_plugin` generates its `allow-`/`deny-` permissions (keep in sync with `init`).
const COMMANDS: &[&str] = &[
    "git_version",
    "git_status",
    "git_log",
    "git_commit_files",
    "git_diff",
    "git_show_file",
    "git_stage",
    "git_unstage",
    "git_discard",
    "git_commit",
    "git_fetch",
    "git_pull",
    "git_push",
    "git_branches",
    "git_switch",
    "git_remotes",
    "git_remote_set",
    "git_merge_abort",
    "git_init",
    "git_clone",
    "git_tokens",
    "git_token_set",
    "git_identity",
    "git_identity_set",
    "git_install_tools",
    "git_resolve",
    "git_conflict_markers",
    "git_merge_continue",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
