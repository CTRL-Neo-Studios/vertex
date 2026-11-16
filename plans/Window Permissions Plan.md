# Window Permissions Plan

Draft, nothing built. A sub-plan of the Plugin Architecture Plan (K5's capabilities line): what each window may do,
decided when the window opens from the kernel's rules and the plugins that are on, instead of four hand-kept files.

## What was measured (Tauri 2.12.5, the tree after K5)

- **Files:** every window kind may read and write almost any file on the disk. `fs:read-all`, `fs:write-all`,
  `fs:allow-rename`, `fs:allow-mkdir` and `fs:allow-exists` have the scope `**/*` in all four capability files (dot
  paths aside, with `.vertex` and `.trash` added), and `opener:allow-open-path` too. The asset protocol's scope is `**`
  and there is no CSP (`tauri.conf.json`). Next to this, K5's split of the app's own commands is small.
- **Window kinds aren't a boundary yet.** Every window may create windows from JavaScript
  (`core:webview:allow-create-webview-window`; `useAppWebviewWindows.ts` passes the label), and a capability is matched
  by label. Any window can open a `settings` or `session-…` window and gets that kind's grant.
- **Tauri can grant at runtime.** `app.add_capability(CapabilityBuilder::new(id).window(label).permission(…)
  .permission_scoped(permission, allow, deny))` (the `dynamic-acl` feature, on by default). The authority is read on every
  call, so a grant added later applies to open windows at once. It only adds: there is no removal.
- **`fs:scope` is global**, shared by every window. A scope for one window has to be on that window's command
  permissions (`permission_scoped`).
- **Static files can't serve community plugins.** Capability files are compiled in. A plugin installed later can only
  use what the shipped files already grant its window, so trimming the static files and loading community plugins pull
  in opposite directions.

## What this can and can't do

- A grant is a window's, never a plugin's: plugins run in the window's own realm (the Realm decision), so one plugin
  can use what another plugin of the same window asked for. This is not a sandbox, and the install prompt keeps saying
  so.
- What it does: script that gets into a window through what it renders (a note from a cloned or synced vault, a
  diagram, a fetched page in a chat) can do only what that window may: its own workspace's files, the commands of the
  plugins that are on. A plugin that's off has its commands in no window. The manifest's `permissions` become true for
  the window, not only shown.

## Design

- **The kernel owns the rules, in Rust:** a base grant per window kind (`main`, `session`, `settings`, `about`), and a
  table from permission names to Tauri permissions. A manifest names permissions (`network`, `secrets`,
  `files-outside-workspace` today; `notifications`, `clipboard`, `open-external` and the like as needed), never raw
  Tauri identifiers, so a Tauri upgrade doesn't break plugins and the install prompt stays readable. A core plugin's
  crate adds its own name (`git` → the `vertex-git` commands).
- **Rust opens every window.** A kernel command opens a window of a kind; before it exists, Rust adds its capability:
  the kind's base, plus the grants of the plugins on for it. Which plugins are on is read from what Rust owns (the
  settings, the workspace's overrides, trust; manifests compiled in for core plugins, read from disk for community
  ones), never from what a webview says. JavaScript loses the permission to create windows.
- **A plugin turned on while a window is open:** its grants are added to that window at once. **Turned off:** the
  window reloads (K1) but Tauri can't take a grant back, so the window keeps it until the app restarts. Stated in
  Settings → Plugins only if it turns out to matter.
- **Session windows get their workspace:** file permissions scoped to the window's root (a single-file window: its
  file and that file's folder), plus the app's own folders it needs. Every way a file outside the workspace is reached
  today gets its own answer (below), since each is a place the scope would break.

## Phases

### W0: Spike
Throwaway, as K0 was. A window opened from Rust with a runtime capability and no matching static file:
- reads and writes inside its scoped folder, is refused outside it, and the watcher (`fs:watch`) works under the scope;
- a file picked in a dialog: whether the dialog plugin widens the scope for it, and for which window;
- images through the asset protocol with a per-window scope, or what replaces `**` there;
- a grant added while the window is open applies without a reload;
- the start window, which `tauri.conf.json` creates before any Rust setup: whether it can stay the one static file.
- Output: results in this file; the phases below change to fit.

### W1: Rust opens windows
- A kernel command per window kind replaces `new WebviewWindow` (`useAppWebviewWindows.ts`); labels are made in Rust.
- No capability grants window creation to JavaScript.
- No behaviour change. Closes the label hole by itself.

### W2: Grants assembled at runtime
- The base grant per kind and the permission table, in the kernel crate, with tests (a kind's grant; an unknown name).
- The four capability files go, except what the start window needs before Rust runs (W0 decides).
- Each window's capability is added when it opens: its base only, in this phase, with today's scopes.
- Acceptance: K5's check again (a command outside a kind's grant is refused) and the SMOKE rows for windows.

### W3: Plugins' permissions
- The manifest's `permissions` take the table's names; validation knows them (the SDK's type in C1).
- A window's grant adds those of the plugins on for it; a core crate's commands only where its plugin is on.
- Each X phase declares its plugin's permissions as it writes the manifest; C2's install prompt lists them from the
  same table.
- Acceptance: with git off, no window can call `vertex-git`; a trial plugin without `network` is refused `http_fetch`,
  and with it, isn't.

### W4: Workspace file scope
- Every access outside the workspace, listed and decided: importing dropped or pasted files, attachments in chat,
  single-file windows, Open and Save dialogs, cloning into a new folder, reveal in Finder and open with the default app,
  the app's own data. Each becomes a kernel command that checks what it's given, a dialog, or `files-outside-workspace`.
- Session windows' file permissions scoped to their root; the asset protocol's scope follows W0's finding.
- Best after X4, where file operations become the kernel's (`SessionContext.files`) and have one owner.
- Acceptance: a session window can't read or write a path outside its workspace except through those flows; the
  File Explorer plan's SMOKE rows pass.

## Open decisions

1. **How far:** W1 to W3 make the window kinds real and plugins' permissions true. W4 is the part with the most
   security value and the most ways to break file handling. In scope, or a later plan?
2. **When:** W0 to W2 before X1 (the X phases then declare permissions once, in W3's vocabulary), or after the X phases
   (less to redo if the contract moves, but every manifest is revisited).
3. **A grant that can't be taken back** until restart, for a plugin turned off: acceptable, or should turning one off
   ask to restart?
