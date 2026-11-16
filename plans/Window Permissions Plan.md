# Window Permissions Plan

A sub-plan of the Plugin Architecture Plan (K5's capabilities line): what each window may do, decided when the window
opens from the kernel's rules and the plugins that are on, instead of four hand-kept files. Runs after K5 and before X1;
W0 to W4 are all in scope.

## Decisions

| Topic | Decision |
|---|---|
| Scope | W0 to W4: window kinds made real, plugins' permissions true, and each session window held to its workspace's files. |
| Order | Before the X phases: each X phase writes its plugin's manifest once, with its permissions in this plan's vocabulary. |
| Turning a plugin off | Tauri can't take a grant back, so turning a plugin off asks to restart the app (replacing K1's window reload). Its grants are gone after the restart. |

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
- **`fs:scope` is global**, shared by every window: Tauri merges every capability's global scope by plugin, not by
  window (`ScopeManager::get_global_scope_typed`). A scope for one window has to be on that window's command
  permissions (`permission_scoped`), and no capability may grant a global `fs:scope` at all.
- **Dialogs and the fs plugin's own scope are app-wide.** A path is allowed if the fs plugin's runtime scope allows it
  (its config, plus whatever Rust adds through `fs_scope()`) or the calling window's scopes do. A file or folder picked
  in a dialog is added to that runtime scope and to the asset protocol's (`tauri-plugin-dialog`'s `open`/`save`), so a
  pick in one window can be read from every window.
- **The asset protocol's scope is app-wide** too (`Scopes::asset_protocol`): it can't differ by window.
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
- **A plugin turned on while a window is open:** its grants are added to that window at once. **Turned off:** the app
  asks to restart (Decisions); until it does, the plugin stays on in its windows, so nothing runs with grants it
  shouldn't have and no window is half-updated.
- **Session windows get their workspace:** file permissions scoped to the window's root (a single-file window: its
  file and that file's folder), plus the app's own folders it needs. Every way a file outside the workspace is reached
  today gets its own answer (below), since each is a place the scope would break.

## Phases

### W0: Spike (done)
Throwaway (a module in the app crate, a harness, and the four capability files without their global `fs:scope` for
the second run; all removed). The start window opened `spike-a` from Rust through an app command after
`app.add_capability`, with `core:default` and six fs commands each scoped to `/tmp/w0/a`.
- **Run 1, the static files as they are:** reads and writes in `/tmp/w0/b` and `exists('/etc/hosts')` were allowed:
  the other windows' global `fs:scope` (`**/*`) reached `spike-a`. This is the leak the measurements predicted.
- **Run 2, no global `fs:scope` anywhere:** in its folder `spike-a` read, wrote, and watched (one event came). Outside,
  reads, writes, `exists` and `watch` were refused (`forbidden path`).
- **A grant added while it was open** (`/tmp/w0/b`, a second capability for the same label) applied at the next call, without a reload.
- **A custom protocol** (`register_uri_scheme_protocol`) saw the calling window's label (`UriSchemeContext::webview_label`),
  so files can be served per window by a protocol that checks the window's root.
- **Refusals:** `spike-a` was refused a kernel command it wasn't granted, and creating a window from JavaScript
  (`core:default` doesn't include `allow-create-webview-window`).
- **From the source, not run:** a dialog's pick widens app-wide scopes (above); the start window is created from
  `tauri.conf.json` before setup, and creating it in setup instead (as `spike-a` was) gives every window the same path.

What it changes:
- **W1:** the start window is made in Rust's setup too (`create: false` in `tauri.conf.json`), so no window is
  configured statically and the capability files can all go in W2.
- **W2:** no capability grants a global `fs:scope`; every fs permission is scoped per command.
- **W4:** dialogs go through kernel commands that show them in Rust (`tauri_plugin_dialog`'s Rust API, which doesn't
  touch any scope) and add the pick to the asking window's grant only. Workspace files reach the webview through a
  kernel protocol that checks the asking window's root, replacing the asset protocol's `**` (whose scope is then
  empty).
- A label keeps its grants after its window closes (they can't be removed). A session window's label comes from its
  session's uuid, which never changes root, so a reopened window gets the same grant again.

### W1: Rust opens windows (done)
- A kernel command per window kind replaces `new WebviewWindow` (`useAppWebviewWindows.ts`); labels are made in Rust.
- The start window too: created in setup, not by `tauri.conf.json`.
- No capability grants window creation to JavaScript.
- No behaviour change. Closes the label hole by itself.

As built:
- **`window_open`** (kernel crate, `src/windows.rs`): a request `{kind: 'session', uuid, title}`, `{kind: 'settings',
  path?, scope?}` or `{kind: 'about'}`. A pure `plan` makes the label, route, title and size: a session must be in
  `sessions.json`; Settings only opens on `/settings` or a page under it (no `?`, `#` or `..`), with `scope` as its
  query. An open window is brought forward instead. The command is `async`: Tauri runs a synchronous command on the
  main thread, and building a window there froze the app in the first run.
- **The lifecycle moved into the kernel plugin:** the start window shown only while no session window is
  (`sync_main_visibility`), each session's `open` mark, and window destruction (the plugin's `on_event`). Each window's
  style is the app crate's (`api::set_window_style`): decorum's title bar only works with the concrete runtime, which
  the generic kernel doesn't name.
- **The start window:** `tauri.conf.json` keeps its description with `label: "main"` and `create: false`;
  `api::open_main` builds it in the app crate's setup, after every plugin is set up.
- **The app crate** keeps the plugins, the start window, file opening and `ExitRequested`; the `tauri://webview-created`
  listener and its window bookkeeping are gone.
- **Frontend:** `openAppWindow(request)` in `useAppWebviewWindows`; Settings and About no longer attach a close listener
  that destroys them (closing works without it).
- **Capabilities:** `core:window:allow-create`, `core:webview:allow-create-webview` and
  `-create-webview-window` left all four files; each gained `vertex:allow-window-open` (the native menu's Settings… and
  About run in whichever window is focused).
- **Checked in `tauri dev`:** the start window at launch; JavaScript making `session-evil`, an unknown session and a
  Settings path outside `/settings` refused; a workspace opened (the start window hid), opened again (the same window
  came forward); Settings on `/settings/ai/providers?scope=…` and About (420×481, not resizable) opened and closed; the
  session closed and the start window came back. 39 Rust tests (three for `plan`), 319 frontend tests, typecheck unchanged.

### W2: Grants assembled at runtime (done)
- The base grant per kind and the permission table, in the kernel crate, with tests (a kind's grant; an unknown name).
- The four capability files go; every grant is added at runtime, before its window is built.
- No global `fs:scope`: today's file scopes move onto each fs command's permission.
- Each window's capability is added when it opens: its base only, in this phase, with today's scopes.
- Acceptance: K5's check again (a command outside a kind's grant is refused) and the SMOKE rows for windows.

As built:
- **`grants.rs`** (kernel crate): `WindowKind` (from a label), and a window's capability (`capability(label, kind,
  crates)`): `SHARED` (Tauri's and the third-party plugins' permissions, every kind alike, as the four files had them,
  without the entries a set they named already holds: 160 to 77), `SCOPED` (the file permissions), and the commands of
  the kernel (`KERNEL`) and of each core crate for that kind. `grant_window` adds it before `window_open` or
  `open_main` builds the window, once per label (Tauri appends a capability added twice).
- **The core crates name their own commands:** each has `pub const GRANTS` (per kind) and registers it in its setup
  (`api::grant`), so the kernel names no feature's command.
- **Files:** `fs:read-all`, `fs:write-all` and `fs:allow-exists` carry today's scopes (with the dot folders);
  `fs:allow-rename`, `fs:allow-mkdir` (both in `write-all`, same scope) and `fs:allow-watch` (in `read-all`) went. No
  `fs:scope`, and no `fs:default`: its allows are global scopes (the app's own folders, which the frontend never reads
  through the fs plugin); only its two denies stay (the webview's data, Linux and Windows).
- **The permission table moved to W3,** which is the first to use it (a manifest's names); W2 grants by kind only.
- **Tauri panics on an unknown identifier** (`add_capability` unwraps), so the app crate's test adds every kind's
  capability to the real context (`generate_context!`, now one `context()` used by `run` too: on macOS it embeds
  `Info.plist` as a symbol, which can't be defined twice) and checks commands in and out of each kind's grant.
- **Checked in `tauri dev`:** in each kind, a command of its grant goes through and one outside is refused (main:
  `chat_read`, `trash_item`; a workspace: `ai_key_set`, `update_token_set`; Settings: `sessions_upsert`, `git_status`;
  About: `trash_item`). A workspace window read, wrote, watched and found `.vertex`; a single-file window read its file;
  nothing the app does while loading was refused. SMOKE 15 (closing a workspace, reopened: its label granted once), 7
  (Settings, About), 2 and 4 (quit with a workspace and a single file open; both reopened, recovery `both`). 40 Rust
  tests.

### W3: Plugins' permissions (done)
- The permission table (from W2), in the kernel crate, with a test (an unknown name). The manifest's `permissions`
  take its names; validation knows them (the SDK's type in C1).
- A window's grant adds those of the plugins on for it; a core crate's commands only where its plugin is on.
- Each X phase declares its plugin's permissions as it writes the manifest; C2's install prompt lists them from the
  same table.
- Acceptance: with git off, no window can call `vertex-git`; a trial plugin without `network` is refused `http_fetch`,
  and with it, isn't.
- Turning a plugin off, globally or in a workspace, asks to restart the app (Restart now / Later); until then it stays
  on. Settings → Plugins says a change waits for a restart. K1's `onBeforePluginReload` flush becomes the restart's.
- Acceptance (also): turning a plugin off and restarting leaves its commands in no window.

As built:
- **The table** is `shared/plugin/permissions.json` (name → Tauri permissions: `network` is `http_fetch`, `secrets`
  the three secret commands, `files-outside-workspace` nothing until W4), one file for both sides: `manifest.ts` takes
  `PLUGIN_PERMISSIONS` and the `PluginPermission` type from its keys, the kernel reads it at build (`include_str!`). A
  name outside it is an error when the grant is made (tested).
- **Which plugins Rust knows:** the core plugins' `plugin.json`s, embedded by the app crate's `build.rs`
  (`layers/*/plugin.json`; `layers/.gitkeep` keeps the folder, as Cargo reruns a build script on every build while a
  watched path is missing) and handed over with `api::set_core_plugins`. What it reads of one: `id`, `windows`,
  `permissions`, `enabledByDefault`. The built-ins have no manifest Rust can read, so a core crate's plugin without a
  manifest counts as always on, until its X phase gives it one.
- **On for a window** (`plugin_on`, `plugins_on`; tested): made for its kind; the global `plugins.enabled`, and in a
  workspace's window its `.vertex/settings.json` (off from any workspace, on only from a trusted one: `folder_trusted`,
  the frontend's `folderTrustedBy`, tested), else the manifest's default. Rust follows the user's choice, not
  `requires`: a plugin on whose requirement is off is granted though it doesn't run.
- **Grants:** a window's base, then one capability per plugin on with anything to grant
  (`window-<label>-plugin-<id>`): its permissions' Tauri permissions and its crate's commands for the kind (crates
  register with `api::grant(app, PLUGIN, GRANTS)`; `ai`, `chat`, `git`). `grant_window` adds only what a label lacks.
  `http_fetch` and the secret commands left the base grants; `http_fetch` stays in the session base for the chat
  built-in's web fetch, which X8 moves to chat's manifest. Settings got `restart_app` and `plugins_waiting_restart`.
- **Turned on:** a save of the global settings, a workspace's settings (update or reload) or trust now emits its event
  only after its lock is released and `regrant` has granted every open window what's newly on for it, so a window
  hears of a plugin only once it may call its commands.
- **Turned off:** the host leaves a running plugin running (no window reload: `reload`, `isPluginReload`,
  `onBeforePluginReload` and the persistence's `flush` export are gone). `plugins_waiting_restart` lists the plugins
  a label was granted but which are off for it now. Settings → Plugins shows them in an alert with Restart now, rather
  than a Restart now / Later dialog: the alert stays until the restart, so Later is leaving it.
- **Restart:** `restart_app` flushes the session windows as `quit_app` does (`flush_windows`, shared), leaves a
  `restarting` file in the app data and asks Tauri to restart. At launch `api::open_launch_windows` (was `open_main`)
  opens the start window, and when that file is there, every session window that was open (`reopen`), whatever the
  recovery setting, as the reload did.
- **Tests:** the app crate's ACL tests now cover a core crate's commands with its plugin off and on (git), a plugin's
  `network` and `secrets` in the window kind it runs in, and the base without them; the kernel's cover `plugin_on`, the
  table, and a capability per plugin. 47 Rust tests; 319 frontend tests (the host's reload test became "keeps a
  running plugin that is turned off running"); typecheck unchanged.
- **Checked in a debug build** (the frontend embedded, as a restart under `tauri dev` loads a dev server the CLI stops;
  two trial layers for the start window, `zz-plain` without permissions and `zz-net` with `network`, off by default;
  all deleted after): `zz-plain`'s `ctx.http.fetch` refused; `zz-net` turned on: started at once and fetched (200), and
  the window could call `http_fetch`; turned off: still running, still allowed, Settings → Plugins listed it with
  Restart now; Restart now: the app came back with the workspace window it had (recovery off), `zz-net` off and
  `http_fetch` refused again. With git still a built-in, "git off" is the Rust test's, not the app's.

### W4: Workspace file scope
- Every access outside the workspace, listed and decided: importing dropped or pasted files, attachments in chat,
  single-file windows, Open and Save dialogs, cloning into a new folder, reveal in Finder and open with the default app,
  the app's own data. Each becomes a kernel command that checks what it's given, a dialog, or `files-outside-workspace`.
- Session windows' file permissions scoped to their root (`permission_scoped` per fs command). Dialogs shown from Rust,
  the pick added to the asking window only. Images and other workspace files the webview loads: a kernel protocol
  checking the window's root instead of the asset protocol (scope emptied).
- Ahead of X4, so the outside-the-workspace flows become kernel commands here, in the composables that do them today;
  X4 moves those composables into the kernel's `SessionContext.files` without changing what they may reach.
- Acceptance: a session window can't read or write a path outside its workspace except through those flows; the
  File Explorer plan's SMOKE rows pass.

## Status

W0 to W3 done. W4 next.
