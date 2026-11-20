# App Plugins Plan

Two things the user asked for on 19 Nov, planned together because both take plugins past a workspace window:

- **Part A, app-level windows:** Furball should live without a workspace open, "kinda like a little agent": stay out
  when workspaces close, open a workspace, later take things down.
- **Part B, the Now Playing line:** the hairline after a pane's actions becomes a line that jumps with the system's
  audio, and opens play controls.

Nothing here is built. Each part starts with a spike, because each rests on something not yet proven.

## What exists (read 19 Nov)

- **A plugin already says which windows it runs in** (`manifest.windows`: `main`, `settings`, `session`; default
  `['session']`; `startPlugins` in `app/utils/plugins/runtime.ts`). So "a global runtime" isn't a second kind of
  plugin: a plugin with `main` in its `windows` runs without a workspace today.
- **The start window (`main`) lives as long as the app does.** It's hidden while any session window exists and shown
  again when the last closes (`sync_main_visibility`, `windows.rs`).
- **A plugin's own window is its session's.** `WindowRequest::Plugin` is refused unless the caller is a session window
  ("a plugin's window opens from a session window"); the label carries the session; `destroyed` closes it with its
  session window. `window_message` goes only between a session window and its plugins' windows.
- **A plugin's global store tells every window** (`data_set` emits to all), but a plugin's own window can't read it.
- **The hairline** is `SEPARATOR` in `app/components/LayoutComponents/PanelPane.vue`: the rest of every pane's action
  row (left and right panels), a hairline across its middle, the whole of it a window drag region.
- **Core plugins** are layers (`layers/<id>` with `plugin.json`, `app/plugin.ts`); system work lives in kernel crates
  (`src-tauri/crates/tauri-plugin-vertex-{ai,chats,git}`).
- **This machine is macOS 27.0.1.** What I know of macOS's audio and media APIs ends before it; the spikes say what's
  true here.

## Decisions (mine, the user's to overrule)

1. **No new plugin type.** One kind of plugin; what's added is a window owned by the app instead of a session, a way
   for one plugin's windows to talk, and a small app API behind a permission.
2. **One kitty for the app,** not one per workspace (answers Furball's open question 1).
3. **Only globally installed plugins** get app-level windows and the app API. A workspace's own plugins (C3) don't:
   they're trusted for that workspace only.
4. **"Create a task in a workspace" needs no cross-plugin, cross-window API.** Tasks already feeds Furball inside a
   session window (`ctx.provide`); Furball's instance there passes things on to Furball's app window (A2) and takes
   "done" back. A plugin reaching into a workspace that isn't open stays out of this plan.
5. **Now Playing is a core plugin** (`now-playing`) over a kernel crate: it needs system calls no installed plugin
   may make. Off in Settings → Plugins, the hairline is the hairline.
6. **The controls work without any permission; the jumping line asks for one,** and only when the user switches it
   on in the popover. Reading system audio makes macOS ask ("System Audio Recording"); a prompt at first launch for a
   decoration would be wrong.
7. **macOS only for now** (no Windows or Linux machine here). The kernel answers "unsupported" elsewhere and the line
   stays a hairline; the crate's shape leaves room for WASAPI loopback / SMTC and PipeWire / MPRIS.
8. **Every pane's row gets the line** (left and right), since it's one component; one audio stream per window feeds
   them all.

---

# Part A: App-level windows

## A0: Spike, the hidden start window
A plugin in `main` is what would own the kitty's window, and `main` is hidden most of the time.

### Change
- Throwaway: a plugin in `main` that logs a timer tick and a Tauri event every second; open a workspace (main hides)
  and read the log for a minute.

### Acceptance
- [ ] Known: whether timers and events still reach a plugin in the hidden start window on macOS, and how late. If
  they don't, the owner of an app-level window is the kernel alone (A1 says so), not a plugin instance in `main`.

## A1: A plugin's window owned by the app

### Change
- **Kernel** (`windows.rs`): `WindowRequest::Plugin` from `main` too. Such a window's label carries `app` where a
  session's uuid goes; it's granted for a plugin that is on globally, installed globally and lists `main` in
  `windows`; it isn't closed with any session window; it closes when its plugin is switched off, or at quit.
  `sync_main_visibility` ignores it (a kitty on the desktop doesn't count as a window that keeps `main` hidden or
  shown). `window_message` between `main` and it, as between a session and its windows.
- **The page:** a plugin window owned by the app loads the global copy of its plugin, with no `root`.
- **SDK** (1.8.0): `ctx.windows.open` documented for `main`; `WindowProps.window.owner: 'app' | 'session'`.
- Docs (`context.md`, `package.md`, `versions.md`), the contract tests, kernel tests for the plan and for closing.

### Acceptance
- [ ] A test plugin in `main` opens its window; opening and closing workspaces leaves it open; switching the plugin
  off closes it; quitting closes it.
- [ ] A session window still can't open another session's window, and a workspace's own plugin can't open an app one.

## A2: One plugin's windows talk to each other

### Change
- **Kernel + SDK:** `ctx.windows.broadcast(message)` and `ctx.windows.onBroadcast(fn)`: a message from one window's
  instance of a plugin to that plugin's instances in every other window (start, session, its own windows). Same
  plugin id only; size-capped as params are. Nothing is kept: a window that opens later hears nothing of before.

### Acceptance
- [ ] A message from a session window's instance arrives in the app-owned window's and back; no other plugin hears
  it (kernel test).

## A3: The app API

### Change
- **Manifest:** permission `app:workspaces`, shown at install like the others.
- **SDK:** `ctx.app.workspaces()` (the sessions the start window lists: name, path, whether open) and
  `ctx.app.openWorkspace(path)` (what the start window's own button does: one session, one window, focused if open).
  Refused without the permission, and for a workspace's own plugins.

### Acceptance
- [ ] With the permission a plugin lists and opens a workspace from an app-owned window; without it both are refused.

## A4: Furball 0.2.0

### Change
- `windows: ['main', 'session']`, `permissions: ['app:workspaces']`, SDK ^1.8.0.
- The desk window is the app's: let out from anywhere, it stays out when workspaces close and comes back at the next
  launch if it was out (a setting). One kitty: a session window's overlay kitty and the desk kitty aren't both shown.
- Sources (Tasks' agenda) reach it from every open workspace by A2, each labelled with its workspace; "done" goes
  back the same way. With no workspace open it's a pet with nothing to hold.
- Its menu: Open workspace › (recent ones, A3), Call it back.

### Acceptance
- [ ] With no workspace open, the kitty is on the desktop; opening one from its menu works; closing it leaves the
  kitty out.
- [ ] A task due in an open workspace is held up by the desk kitty and can be ticked there; the file changes.

---

# Part B: The Now Playing line

What the user described: the line is dots at rest; with sound, its dots grow into bars, centred vertically, tallest
in the middle and nothing at either end (0 → 1 → 0 across), as tall as the row at most. Hovered, it turns the primary
colour with a tooltip ("Show play controls"); clicked, a small popover: previous, play/pause, next, a progress bar
and a volume slider where the system gives them.

## B0: Spike, what macOS 27 allows
Four throwaway probes in Rust on this machine, and one in the page. Reported to the user before B1, because they
decide the scope.

| Wanted | How, as far as I know | To find out |
| --- | --- | --- |
| The system's audio levels | A Core Audio process tap (macOS 14.4+) | Does it work here; the exact prompt; whether an indicator shows while it runs; CPU |
| Play/pause, next, previous | Media key events posted to the system | Do they reach the playing app; whether Accessibility is asked for |
| Title, artist, position (the progress bar) | Only the private MediaRemote framework, which Apple closed to other apps in 15.4 | Whether anything public gives it here. Likely **no**: then no title and no progress bar on macOS |
| Volume | Core Audio's default output device volume (public) | Works for the current output; what a device without a volume (some DACs, HDMI) does |
| A click on a window drag region | — | Whether a click still arrives on the line while a drag still moves the window; else the line stops being a drag region |

### Acceptance
- [ ] Each row answered with what was run and seen; the scope of B1–B3 restated from it and agreed.

## B1: The kernel's media crate

### Change
- `src-tauri/crates/tauri-plugin-vertex-media`, for the core plugin's windows only:
  - `media_levels(channel)`: about 32 band levels, 0–1, 30 times a second, over a Tauri channel. One capture for the
    app however many windows listen; it stops with the last listener; a window that's hidden or minimized stops
    listening. Silence sends nothing.
  - `media_command(play_pause | next | previous)`, `media_volume()` / `media_set_volume(0–1)`, and
    `media_now_playing()` only if B0 found a way.
  - `media_capabilities()`: which of these this system has, so the plugin draws only the controls that work.
  - Other systems: every command answers `unsupported`.
- The usage string macOS shows in its prompt, in `Info.plist`.

### Acceptance
- [ ] With music playing, levels arrive and follow it; paused, they stop; no listener, no capture (checked by the
  system's indicator or the process's CPU).
- [ ] Each command does what it says in the playing app.

## B2: The host's slot

### Change
- A contribution point for the row's rest (`paneRule`, name open): one component, drawn in place of `SEPARATOR`'s
  hairline in every pane; without one, the hairline as now. Core plugins only.

### Acceptance
- [ ] With the plugin off, the row looks and drags as it does today.

## B3: The plugin

### Change
- `layers/now-playing` (core, on by default; the visualiser inside it off until switched on):
  - **The line:** a canvas the row's size. At rest, dots. With levels, each dot a bar grown both ways from the middle
    line, its height its band's level × the envelope (0 at the ends, 1 in the middle) × the row's height; eased so it
    doesn't flicker. Muted colour; primary when hovered. Redrawn only while levels arrive; one draw under a
    millisecond; nothing laid out. Reduced motion (the system's setting): bars don't move, the line only brightens.
  - **Hover and click:** tooltip "Show play controls"; a click opens a `UPopover`: previous, play/pause, next;
    volume; title and progress if B0 allowed; and the switch "Move with the music", which is what asks macOS for
    system audio the first time. Refused, the switch says so and how to allow it in System Settings.
  - Settings page: the switch again; strings en and zh-CN.

### Acceptance
- [ ] Music playing and the switch on: the line moves as described, in both panels and in two windows at once;
  hovered it's the primary colour; paused it settles to dots.
- [ ] The popover's controls work on the playing app; what the system doesn't give isn't drawn.
- [ ] The switch off, or the permission refused: no capture runs, the line is dots, the controls still work.
- [ ] Typing in the editor with the line moving shows no frame over what it had without it (measured).

## Not in this plan

- A plugin acting on a workspace that isn't open (taking a note or a task into it). After A4, if wanted.
- Windows and Linux for Part B; a kitty that dances to the music (A and B meeting: the levels would have to be an API
  plugins may read, which is a permission of its own).
- Choosing which app's audio moves the line; an equalizer look; album art.

## Open questions

1. Should the visualiser's permission be asked at the switch (planned), or should the plugin be off entirely until
   turned on in Settings?
2. If macOS gives no title or position (B0), is a popover of three buttons and a volume slider still wanted?
3. Should the kitty be out at launch by default, or only once the user has let it out?
