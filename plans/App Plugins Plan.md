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
- [ ] Each row answered with what was run and seen; the scope of B1–B3 restated from it and agreed. (Answered
  below; the scope waits on the user.)

### Found (20 Nov, macOS 27.0.1, MacBook Pro speakers; Swift probes in `/tmp`, the user's go-ahead)
- **Levels: yes.** A global process tap (`CATapDescription(stereoGlobalTapButExcludeProcesses: [])`, private, read
  through a private aggregate device with tap auto-start) read Cider's music: 48 kHz stereo floats, peaks 0.14–0.5,
  created in 60–72 ms, about 1.5–2 ms of CPU a second. It captures what apps play, before the device's volume or
  mute: the speakers read volume 0 and muted while it heard the music. The user allowed the capture prompt when it
  came (for the process running the probe; Vertex's own will need `NSAudioCaptureUsageDescription`).
- **Volume: yes.** The default output's `VirtualMainVolume` is readable and settable; mute is readable.
- **Title, artist, duration, position, rate: only by a workaround.** `MRMediaRemoteGetNowPlayingInfo` answers
  nothing to an ordinary process (as since macOS 15.4), but answers in full from inside `/usr/bin/perl` (a dylib
  loaded by `DynaLoader`): "Intro", No Party for Cao Dong, 245.9 s, elapsed 132 s, rate 1; it followed Music's pause
  (rate 0) and play (1). The same trick third-party now-playing apps use. Apple may close it in any update.
- **Play/pause, next, previous: no general way.** Nothing sent paused Cider or Apple Music: a system-defined media-key
  event posted at the HID tap or at the session tap (Accessibility granted), `IOHIDPostEvent` with
  `NX_SUBTYPE_AUX_CONTROL_BUTTONS`, `MRMediaRemoteSendCommand(togglePlayPause)` from the process and from perl (each
  answered true). Cider's level and Music's rate didn't change. The keyboard's own play key does pause Cider (the
  user, pressed by hand). Only an app's scripting works: `tell application "Music" to playpause` paused and resumed
  (rate 0, 1); Spotify is scriptable the same way; **Cider isn't** (no scripting dictionary). Scripting an app makes
  macOS ask, once per app, to let Vertex control it.
- **A click on the drag region:** not tried; it needs the app, and is settled in B2 either way (the line stops being
  a drag region if a click doesn't arrive).

### Scope, from B0 (the user's call, 20 Nov)
- **The line:** levels from the global process tap, as planned.
- **The popover:** title, artist and a progress bar through the `/usr/bin/perl` workaround, gone (not broken) if
  Apple closes it; a volume slider (the default output's); previous, play/pause and next **only while Apple Music or
  Spotify is the app playing**, by their scripting. For anything else (Cider) the buttons aren't drawn.

## B1a: Levels

### Change
- `src-tauri/crates/tauri-plugin-vertex-media` (plugin `vertex-media`; granted to session windows while the core
  plugin `now-playing` is on), macOS only, `objc2-core-audio`:
  - `media_levels_listen(channel)` → a listener id; `media_levels_stop(id)`. One tap and one aggregate device for the
    app however many listen; started by the first listener, torn down after the last stops (and when a window that
    listened is destroyed). The IO block only copies samples into a ring; a thread every ~33 ms takes the last 1,024
    mono samples, windows them, FFTs them (`rustfft`), and sends 32 bands (log-spaced 60 Hz–16 kHz, 0–1, dB-scaled)
    to each channel; silence (every band under a floor) for half a second sends one zero frame, then nothing.
  - Errors as words the plugin can show: `unsupported` (not macOS 14.2+), `denied` (the capture refused).
- `NSAudioCaptureUsageDescription` in the app's `Info.plist`.
- Kernel tests: the band maths (a sine lands in its band; silence is zeros), the listener count (start once, stop
  after the last).

### Acceptance
- [x] With music playing, a listener gets 30 frames a second that follow it; paused, frames stop after a zero frame;
  the last listener gone, the tap and device are destroyed (the capture indicator goes, the CPU drops).
- [x] Capture costs under 1% of a core with one listener and with three (measured).

### As built
- **The crate** `tauri-plugin-vertex-media` (`PLUGIN = "now-playing"`, granted to session windows):
  `media_levels_listen(channel)` → id, `media_levels_stop(id)`; a destroyed window's listeners go
  (`RunEvent::WindowEvent Destroyed`). `Levels` keeps the listeners and, while there are any, one `Running`: the
  `tap::Tap` (process tap + private aggregate device + IO block, destroyed on drop) and the analyzer thread, stopped
  and joined outside the lock. Frames go as raw bytes (`InvokeResponseBody::Raw`, 32 × 0–255).
- **The IO block** mixes the first buffer to mono into `Ring` with `try_lock` (a busy ring drops that buffer; nothing
  waits or allocates on the audio thread). The ring counts what was written: no new samples since the last frame
  counts as silence (a paused player stops the tap's buffers rather than sending zeros).
- **The bands** (`bands.rs`): 2,048-sample Hann FFT (`rustfft`), 32 log bands 60 Hz–16 kHz, a band's loudest bin,
  −60..0 dB → 0..255. Frames by deadline (sleeping a fixed 33 ms gave 25 a second).
- **Errors:** `unsupported` (no `CATapDescription`: before macOS 14.2, or not macOS); otherwise the failing step and
  its status. A refused capture's status wasn't seen (the probes' process was allowed), so there's no `denied` word
  yet; B3 shows what comes.
- `src-tauri/Info.plist` with `NSAudioCaptureUsageDescription` (Tauri merges it into the bundle and the dev binary).
- **Tests:** 4 (a sine at 100 Hz, 1 kHz and 8 kHz is loudest in its band and quiet far from it; silence and too few
  samples are zeros; every band has bins at 44.1, 48 and 96 kHz; the ring keeps the latest without growing). The
  listener lifecycle was checked live, not by a test (it needs the hardware). Kernel: every crate's tests pass.
- **Checked live** (a throwaway example calling `Levels` directly, deleted after; a 200 Hz + 1 kHz tone played by
  `afplay` on the muted speakers): the first listener started the capture in ~105 ms; 30.3 frames a second; the
  tone's bands lit (bands 5–8 around 200 Hz at 45–179, band 15 at 1 kHz at 112, the rest 0); three listeners (two in
  one "window") each 91 frames in 3 s; dropping that window stopped its two; the last stop tore down in 18 ms, after
  which no frames came and CPU was 0.02–0.04%. CPU while capturing: 0.30% of a core with one listener, 0.28% with
  three. With nothing playing: 15 frames (half a second of quiet ending in zeros), then none.
- **Risk for B1b and B1c, found here:** release builds are signed with `Entitlements.plist`, which turns on the App
  Sandbox. A sandboxed app needs `com.apple.security.automation.apple-events` and a scripting-targets exception for
  Music and Spotify (B1b), and its child processes inherit the sandbox, which may stop `/usr/bin/perl` reaching
  MediaRemote (B1c). `tauri dev` isn't sandboxed, so dev checks won't show it; each needs a signed build to check.

## B1b: Volume and the scriptable players

### Change
- `media_volume()` / `media_set_volume(0–1)` on the default output (`unsupported` for a device without one).
- `media_player()`: which of Music and Spotify is running and playing (asked of the running one only, never
  launching it), with its state; `media_command(app, play_pause | next | previous)` by `NSAppleScript`. The first
  call asks macOS to let Vertex control that app (`NSAppleEventsUsageDescription`).

### Acceptance
- [ ] The slider's value moves the system volume and follows changes made elsewhere. (Set and read back; following
  is B3's: the popover reads `media_volume` while it's open.)
- [ ] With Music (then Spotify) playing, each command does what it says; with Cider playing, `media_player()` says
  none, so no buttons. (Music checked; Spotify isn't installed here; Cider playing with Music open and paused gives
  Music, see below.)

### As built
- `system.rs` (macOS; elsewhere every command answers `unsupported`), four commands, all `async` over
  `api::blocking` (a sync command would run `osascript` on the main thread), granted to session windows:
  - `media_volume()` → `{volume, muted}`: the default output's main volume, or the mean of its first two channels
    for a device with one per channel; `unsupported` for a device with neither.
    `media_set_volume(v)` sets those and, above 0, unmutes (as the system's slider does).
  - `media_player()` → `{app: "music" | "spotify", state}` or `null`: of the two that are running
    (`NSRunningApplication`, so neither is launched), one playing, else one paused (so play can resume it).
  - `media_command(app, play_pause | next | previous)`: only those two apps and those three scripts (anything else
    refused before a script is built); `tell application id … to playpause / next track / previous track` by
    `/usr/bin/osascript`, not `NSAppleScript` (which wants the main thread). A refusal (-1743) answers `denied`.
- `NSAppleEventsUsageDescription` in `Info.plist`; `Entitlements.plist` gains `automation.apple-events` and a
  `temporary-exception.apple-events` for `com.apple.Music` and `com.spotify.client` (the sandbox's way; unchecked
  until a signed build is run).
- **Test:** an unknown player, an unknown control and a control carrying script are refused (5 in the crate).
- **Checked live** (a temporary ignored test run by hand, removed): volume read `0.0, muted`; set to 0.25 → read
  0.25 unmuted, and `get volume settings` said 25 / not muted; put back (0, muted) with `osascript`. With Music open
  and paused: `media_player` → music, paused; play_pause → playing; next "[12:00am] Motif" → "[7:12am] Leitmotif";
  previous → back to "Motif"; play_pause → paused. Spotify, not running → "spotify isn't running".
- **Found:** `media_player` can't tell that another app (Cider) is the one playing while Music sits paused: it
  offers Music's controls. B1c's now-playing app (its bundle id) settles it: controls only when that app is Music or
  Spotify.

## B1c: Now playing

### Change
- A small dylib built with the crate (`cc`, Objective-C), shipped as a resource and loaded into `/usr/bin/perl`, which
  prints now-playing as JSON lines (title, artist, duration, elapsed, rate, the app's bundle id) when it changes.
  The kernel runs one such process while anyone listens (`media_now_listen(channel)`), and kills it after.
- If perl or MediaRemote doesn't answer, `media_now_listen` fails with `unsupported` and the popover shows no title.

### Acceptance
- [x] Title, artist and position follow a playing track in Cider and in Music; the process is gone when the popover
  closes. (Read from Music and from Cider; there's no lasting process to end, see below.)

### As built
- **No dylib, no perl:** `osascript -l JavaScript` is also an Apple process MediaRemote answers, and its ObjC bridge
  reaches `MRNowPlayingRequest` (`localNowPlayingItem.nowPlayingInfo`, `localIsPlaying`,
  `localNowPlayingPlayerPath.client.bundleIdentifier`). Found by trying it before building the planned dylib: one
  call in 40–80 ms, so a one-shot command replaces the listening process (nothing to start, track or kill).
- `media_now_playing()` → `{app, playing, title, artist, album, duration, elapsed, rate, timestamp}` or `null`;
  `unsupported` if the script fails (MediaRemote closed, or the sandbox). The position now is
  `elapsed + rate × (now − timestamp)`, so the popover asks about once a second while open and moves the bar between.
- **B1b's gap closed:** `media_player()` asks now-playing first; when macOS names an app, controls are only for it,
  and only if it's Music or Spotify (`pick`). If macOS can't say, B1b's rule (playing, else paused) stands.
- **Tests** (7 in the crate): `pick` (Cider named → none; Music named → Music even paused while Spotify plays; unnamed
  → playing first, else paused; neither running → none); the script's JSON read, and `null`.
- **Checked live** (a temporary ignored test, removed): Music paused → `com.apple.Music`, "[12:00am] Motif", aksfx,
  album "Radio: Lobby (Original Music from Big Walk)", 270.0 s, at 1.68 s, rate 0, in 61 ms; `media_player` → music,
  paused, 151 ms. Then with Cider (Music quit by then): `sh.cider.genten.mac`, "Pool", No Party for Cao Dong, "The
  Clod", 186.5 s, at 28.6 s, rate 0 (Cider was paused: no "playing audio" assertion, and the position didn't move in
  3 s); `media_player` → none, 40 ms. Music open and paused while Cider plays wasn't seen live; `pick`'s test holds it.
- **Still the sandbox's question:** a sandboxed `osascript` child may be refused MediaRemote; then this answers
  `unsupported` and the popover has no title.

## B2: The host's slot

### Change
- A contribution point for the row's rest (`paneRule`, name open): one component, drawn in place of `SEPARATOR`'s
  hairline in every pane; without one, the hairline as now. Core plugins only.

### Acceptance
- [ ] With the plugin off, the row looks and drags as it does today. (Same classes, no child, by construction; not
  looked at in the app. The row with a rule in it is B3's to check, drag included.)

### As built
- **Contract** (SDK 1.8.0, unpublished): `ctx.views.paneRule(def)`, `PaneRuleDef` (`UiSlot<PaneRuleProps>` + `id`),
  `PaneRuleProps` (`area`, `session`), `ContributionPoints.paneRule`. A public point rather than a kernel import:
  core layers import only the contract and `~/plugin/ui` today, and this keeps it so.
- **Core only:** the host throws for any other source (`ctx.views.paneRule is for Vertex's own plugins`), so an
  installed plugin's setup fails and nothing of it stays registered.
- **Drawing:** `paneRules` registry; `PanelPane.vue`'s row end is `SEPARATOR` (`relative flex-1 self-stretch ms-1`,
  the drag region) plus `HAIRLINE` when no rule, or the first rule's `PluginMount` filling it (`absolute inset-0`,
  props `{area, session}`) once the window's plugin session exists. Both rows: the bottom panel's and the sides'.
- **Docs:** `context.md` (`ctx.views.paneRule`, which the docs test requires), `versions.md` (1.8.0).
- **Checks:** a host test (a core plugin registers one; an installed one fails with that message and registers
  nothing); Vertex typecheck 7 errors (the baseline, all `@type32/latex2vue`), 398 tests; SDK build, `tsc`, 8 tests.

## B3: The plugin

### Change
- `layers/now-playing` (core, on by default; the visualiser inside it off until switched on):
  - **The line:** a canvas the row's size. At rest, dots. With levels, each dot a bar grown both ways from the middle
    line, its height its band's level × the envelope (0 at the ends, 1 in the middle) × the row's height; eased so it
    doesn't flicker. Muted colour; primary when hovered. Redrawn only while levels arrive; one draw under a
    millisecond; nothing laid out. Reduced motion (the system's setting): bars don't move, the line only brightens.
  - **Hover and click:** tooltip "Show play controls"; a click opens a `UPopover`: the title, artist and progress
    (B1c); previous, play/pause, next when Music or Spotify plays (B1b); volume; and the switch "Move with the
    music", which is what asks macOS for system audio the first time. Refused, the switch says so and how to allow
    it in System Settings.
  - Settings page: the switch again; strings en and zh-CN.

### Acceptance
- [x] Music playing and the switch on: the line moves as described, in both panels and in two windows at once;
  hovered it's the primary colour; paused it settles to dots. (Two windows, one panel each: the right panel was
  closed.)
- [x] The popover's controls work on the playing app; what the system doesn't give isn't drawn.
- [ ] The switch off, or the permission refused: no capture runs, the line is dots, the controls still work. (Off:
  checked. Refused: not tried; the user had allowed it.)
- [x] Typing in the editor with the line moving shows no frame over what it had without it (measured).

### As built
- `layers/now-playing` (commit `8b379ee`, the user's; it took the throwaway harness too, removed after): manifest
  (`windows` session and settings; config `visualizer`, a switch, default off), en and zh-CN strings; `plugin.ts`
  registers the pane rule; `lib/media.ts` (the kernel's commands; `position` from elapsed, rate and timestamp; one
  levels listener per window, ref-counted, stopped while the window is hidden); `lib/shape.ts` (`heights`: bands
  mirrored about the middle, lowest there, times sin(πt); `ease`: up at once, down ×0.82 a frame) with 5 tests.
- **Line.vue:** a button filling the row's end with a canvas; one 2 px dot every 6 px; bars `level × (height − 4)`;
  drawn by `requestAnimationFrame` only while something moves; colour read from the button (`text-dimmed`,
  `text-primary` hovered or open), so no colour transition (the canvas drew mid-transition grey). Reduced motion:
  dots that brighten instead of bars. Tooltip "Show play controls"; a click opens `Controls.vue` in a popover.
- **Controls.vue:** title, artist, a progress bar with times (moved every 250 ms between polls); previous,
  play/pause, next when `media_player` names Music or Spotify, else "Play controls work with Music and Spotify";
  the volume slider; the "Move with the music" switch (`ctx.config.set`), and the capture's error under it. Polls
  `now_playing`, `player`, `volume` every 1.5 s while open.
- **Checked in `tauri dev`** (harness, synthetic events; Music playing on muted speakers): at rest a dotted line where
  the hairline was; colour `oklch(0.552 …)` at rest, `oklch(0.673 0.182 277)` (primary) hovered and open. Popover:
  "Big Walk Theme (Jumping Voices)", aksfx, 1:38 / 3:45, Previous / Pause / Next, volume, the switch. Pause → Music
  `paused`, the button turned to Play; Play → `playing`. With Cider (an earlier run): "Pool", 0:28 / 3:06, no
  buttons, the note. Switch on (the user turned it on and answered the prompt): the canvas changed in each of 6
  samples 150 ms apart, in both of two workspace windows (1,100–1,470 lit pixels). Off: both settled to 544 lit
  pixels, unchanging. Typing 60 characters into the editor, 50 ms apart: worst frames 24/23/22 ms moving, 28/25/24 ms
  still, median 17 ms both.
- **Found:**
  - Editing `Line.vue` under `nuxt dev` hot-swapped it and the plugin's context read undefined ("Now Playing couldn't
    draw this … ctx.config", the user's screenshot); a reload cleared it. Dev only.
  - The line's button now takes the pointer where the row was a window drag region; the rest of the row still drags.
- **Not checked:** a refused capture (what the switch then says), the settings page's switch, a hidden window
  stopping its listener, the right panel's and bottom panel's rows, a signed (sandboxed) build.
- **Seeking** (the user's call after B3): `media_seek(app, seconds)` (Music or Spotify, running; a position that
  isn't finite or is below 0 refused before any script: `set player position to N`), granted to session windows. The
  popover's bar is a `USlider` while Music or Spotify plays (`scrub` holds the dragged position, `change`, which
  Nuxt UI sends on commit, seeks, then a refresh lets go of it); anything else keeps the `UProgress`. Kernel test:
  Cider, −1 and NaN refused (7 in the crate). **Checked:** the kernel took "Silent Gauntlet" from 139.3 s to 30.5 s;
  in the app, the slider's End key then Home key: End seeked to its end, so Music moved on to the next track ("Menu
  Music", 4:03), and Home took that to 2.3 s, the popover showing 0:02 / 4:03.

## B4: Windows

The user (20 Nov): Windows support, planned. Today every system call in `tauri-plugin-vertex-media` is macOS's; on
Windows each command answers `unsupported`, so the line stays dots, the switch shows "macOS 14.2 or later", and the
popover says "macOS isn't saying what's playing" (read from the code: never built or run on Windows). The release
workflow (`tauri-updater-backend`'s `tauri-release.yml`) already builds `windows-x86_64` from `main`, so the crate
must at least compile there.

**Windows gives more than macOS here.** The System Media Transport Controls (SMTC: the media flyout by the volume)
list every app that plays through them (Spotify, browsers, most players; Cider on Windows too, if it registers) with
title, artist, position, and play/pause, next, previous and seek that work for any of them, not two scripted apps.
Levels come from a WASAPI loopback capture of the default output, which asks no permission. Volume is the default
output's `IAudioEndpointVolume`.

**Mapped onto the commands as they are,** so the plugin barely changes:

| Command | macOS (now) | Windows |
| --- | --- | --- |
| `media_levels_listen` / `_stop` | process tap → ring | WASAPI loopback (shared mode, the mix format, usually float) → the same ring; no packets while silent, as the tap |
| `media_now_playing` | MediaRemote via `osascript` | `GlobalSystemMediaTransportControlsSessionManager::GetCurrentSession`: media properties, timeline (`Position`, `EndTime`, `LastUpdatedTime` → `elapsed`, `duration`, `timestamp`), playback info (status, rate); `app` = the session's `SourceAppUserModelId` |
| `media_player` | Music or Spotify by script | the current session, with what its playback info says it allows |
| `media_command` / `media_seek` | `osascript` to Music / Spotify | `TryTogglePlayPauseAsync`, `TrySkipNextAsync`, `TrySkipPreviousAsync`, `TryChangePlaybackPositionAsync` (100 ns ticks) on the session whose app id is given |
| `media_volume` / `_set_volume` | Core Audio | `IAudioEndpointVolume` (`MasterVolumeLevelScalar`, `Mute`) |

### B4a: What each system can do, said

#### Change
- `media_player()` answers `{app, state, can: {playPause, next, previous, seek}}`: on macOS all four for Music and
  Spotify; on Windows the session's own `Controls` flags. `media_command` and `media_seek` take the `app` the popover
  was showing and refuse if it's no longer the one playing (a click mustn't land on another app). The plugin draws
  each button, and the slider, only when `can` says so.
- `media_capabilities()` → `{levels, nowPlaying, volume, controls}` for this system: the switch shows only with
  `levels`; with none of them (Linux for now) the line stays the plain hairline and opens nothing.
- Strings without "macOS"/"Mac" where they're shown on both: "The system isn't saying what's playing", "The line
  follows the sound your computer plays." with "macOS asks the first time." added on macOS only; "Play controls work
  with Music and Spotify" only on macOS.
- A Windows check that runs before `main`: a workflow on `windows-latest` (pull requests touching `src-tauri/` or
  `layers/now-playing/`) running `cargo check --workspace` and `cargo test -p tauri-plugin-vertex-media`. Locally,
  `cargo check --target x86_64-pc-windows-msvc -p tauri-plugin-vertex-media` where it works without MSVC.

#### Acceptance
- [ ] The kernel compiles and its tests pass on `windows-latest`, before any Windows code is written (today's stubs).
- [ ] On macOS nothing changes (B3's checks, quickly again); with every capability off, the row is the hairline.

### B4b: Windows levels

#### Change
- `tap.rs` gets a Windows twin (`loopback.rs`, `windows` crate, `Win32_Media_Audio`): the default render endpoint in
  loopback shared mode, a capture thread (event-driven) mixing each packet to mono into the `Ring`, its sample rate
  from the mix format; started and stopped exactly as the tap is (`Levels` doesn't change). Integer formats
  converted to float. The default device changing mid-capture: the capture restarts on the new one.

#### Acceptance
- [ ] Music playing: 30 frames a second that follow it; paused: a zero frame, then none; the last listener gone:
  the capture thread ends. Under 1% of a core.

### B4c: Windows now playing, controls and seek

#### Change
- `smtc.rs` (`windows` crate, `Media_Control`): `now_playing` from the current session; `player` with `can` from its
  playback info; commands and seek on the session matching `app`. WinRT calls are async: run on the blocking pool
  (`.get()`), as `osascript` is now.

#### Acceptance
- [ ] With Spotify, then a browser tab (YouTube), then the Windows Media Player: title, artist and position read;
  play/pause, next, previous and seek do what they say where the app allows them; buttons it doesn't allow aren't
  drawn.

### B4d: Windows volume

#### Change
- `IAudioEndpointVolume` on the default render endpoint: get, set, and unmute above 0, as on macOS.

#### Acceptance
- [ ] The slider moves the system volume; a change from the flyout shows in the open popover within a poll.

### B4e: Checked on Windows
- Run by someone with a Windows 10 or 11 machine: the release build from `main`, or `bun tauri dev` there. Each of
  B4b–B4d's boxes, then B3's (line in two windows, typing with the line moving). Without that run B4 isn't done:
  everything before it is only compiled.

## Not in this plan

- A plugin acting on a workspace that isn't open (taking a note or a task into it). After A4, if wanted.
- Linux for Part B (PipeWire / MPRIS would be its B4); a kitty that dances to the music (A and B meeting: the levels
  would have to be an API plugins may read, which is a permission of its own).
- Choosing which app's audio moves the line; an equalizer look; album art.

## Open questions

1. Should the visualiser's permission be asked at the switch (planned), or should the plugin be off entirely until
   turned on in Settings?
2. ~~If macOS gives no title or position (B0), is a popover of three buttons and a volume slider still wanted?~~
   Settled by the scope above.
3. Should the kitty be out at launch by default, or only once the user has let it out?
4. **Who runs B4 on Windows** (B4e): there's no Windows machine here. A Windows PC of yours, a VM (Parallels or UTM
   with Windows 11 on ARM, which runs x64 apps), or a tester's?
