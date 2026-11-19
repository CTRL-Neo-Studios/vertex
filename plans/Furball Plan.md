# Furball Plan

A desktop pet: a pixel-art kitty that lives on the desktop while a workspace is open, and reacts to what plugins tell
it (the Tasks plugin first). A plugin of its own (`../vertex-plugin-furball`, GitHub `Type-32/vertex-plugin-furball`,
from the plugin template), and maybe an app of its own one day (the user, 19 Nov).

Nothing below is built except what "Where it stands" lists. Each phase stops for the user: the look and the feel are
theirs to judge.

## Where it stands (19 Nov)

- `src/pet/sprites.ts`: a placeholder kitty drawn in code (32×32 frames put together from parts: sit, blink, happy,
  alert, sleep, walk ×4, held by the scruff; four coats). The user will redraw it in their own style and Catppuccin
  palette, so it gets no more work.
- `scripts/sheet.ts`: draws those frames to a PNG (`bun scripts/sheet.ts`).
- The rest of the repository is still the template (`my-plugin` ids, its panel view). Nothing is committed.

## Decisions

Mine unless marked; change any of them.

1. **The pet is a core with no Vertex in it.** `src/pet/` imports neither Vertex nor Vue: sprites, behaviour, drawing
   on a canvas, pointer gestures. The plugin is a thin host around it, and so would an app be.
2. **The art is one PNG sheet** (`public/kitty.png`: 32×32 cells, one row per animation, a fixed layout documented in
   the README), drawn at a whole-number scale with no smoothing. The user's rework is then replacing one file, from
   any pixel editor. The placeholder is that sheet generated from `sprites.ts`; once the user's sheet is in,
   `sprites.ts` and the script go.
3. **A small window that follows the pet**, not a full-screen see-through one: the window is a little larger than
   the sprite and is moved as the kitty walks or is thrown. To be proven in F2 before anything is built on it.
4. **Mood comes from what it's told, nothing is saved**: no hunger, no death, no streaks. (Its place on the screen
   and its settings are saved.)
5. **Furball knows nothing about tasks.** It provides an API (`ctx.provide`) any plugin can use: give it things to
   hold up and tick, cheer, nudge. Tasks feeds it when Furball is on (`requires: ["furball?"]`, Tasks 0.2.0).
6. **No sound** in this plan.

## F0: The kitty moves

The core and a page to play with it in a browser, with no Vertex.

### Change
- `src/pet/cat.ts`: the behaviour, a pure `step(pet, dt, world)`: sit (blink, tail, eyes follow the pointer), walk
  somewhere, fall asleep left alone, held by the scruff (swings as it's moved), thrown (gravity, bounces off the
  edges, lands with a squash), boop, stroke (purrs: hearts), and what a host can ask: cheer, eat, startle, sleep.
  Squash and stretch as a spring.
- `src/pet/draw.ts`: the sheet's cell for the pet's pose, on a canvas, with the marks that fly off it (hearts, Zs,
  `!`, crumbs).
- `src/pet/stage.ts`: a canvas, the frame loop and the pointer gestures, given by its host a world's size, where a
  pointer is in that world, and a way to move the surface. The page, the overlay and the window all use it.
- `demo/index.html` (`bun demo/index.html`): the kitty on a page, buttons for cheer, eat, startle, sleep.
- One test (`bun test`): thrown, it comes to rest sitting inside the world; left alone it sleeps, a boop wakes it.

### Acceptance
- [ ] On the demo page: it walks, sleeps and wakes; picked up it dangles, thrown it lands; stroked it purrs.
- [ ] The user accepts the feel (the art is theirs to replace).

### As built
- **The core** (`../vertex-plugin-furball/src/pet/`, commit `1c227b4`, not pushed): `cat.ts` (states `sit`, `walk`, `sleep`, `happy`,
  `eat`, `startle`, `held`, `fall`; gravity, walls, ceiling, a floor bounce above a speed; squash and stretch as a
  spring; marks; a seeded random; speeds in body sizes, so 2× and 4× feel alike), `draw.ts` (`SHEET`: the layout,
  7 rows of 32×32 cells: sit ×5, happy ×4, alert ×2, sleep ×2, walk ×4, hang ×2, marks ×4; `pose` picks the cell),
  `stage.ts` (`createStage(canvas, {sheet, scale})`: the canvas takes no pointer events; window listeners, capturing,
  take a press on the kitty and leave every other one alone; click boops, a drag past 4 px holds it, release throws,
  movement over it strokes; `grab` cursor over it). `scripts/sheet.ts` (`bun run sheet`) writes `public/kitty.png`
  from `sprites.ts` in that layout.
- **The demo:** `bun run demo` (`demo/index.html`, Bun's HTML server): the kitty at 3× with Cheer, Eat, Startle and
  Sleep buttons.
- **Checked:** `bun test` (2: thrown at a wall it comes to rest sitting on the floor inside the world; not asleep
  before `SLEEP_AFTER`, asleep after, a boop startles it and it sits again), typecheck. On the demo page in headless
  Chromium: it sat at the bottom; dragged, it hung by the scruff under the pointer; thrown up and left it flew
  stretched; Cheer made it hop with three hearts. No page errors. **Not observed:** stroking, eating, sleep and wake
  on the page (the test covers sleep and wake), and how any of it feels: the user's.
- **Not done, on purpose:** moving the surface (the stage's part in F2) waits for F2.

## F1: In the Vertex window

The plugin, on the SDK as published (1.6.1): no change to Vertex.

### Change
- The template becomes `furball` (ids, strings in `en` and `zh-CN`, README, `bun test` in the workflow).
- An overlay (`ctx.views.overlay`) in session windows: the kitty walks along the bottom of the Vertex window, over
  the layout; only the kitty takes clicks.
- Settings: on or off in the window, its size (2×, 3×, 4×).

### Acceptance
- [x] In `tauri dev`, installed from `dist/`: the kitty walks the window's bottom edge, can be picked up and thrown
  inside the window, and nothing under it stops taking clicks elsewhere.

### As built
- **The plugin:** `furball` 0.1.0, `minAppVersion` `1.0.0-beta.1`, SDK ^1.6.1. `src/main.ts`: one overlay, drawn while
  `shown`; `src/Kitty.vue`: a canvas over the window (`fixed`, `inset-0`, `z-40`), the sheet from
  `ctx.plugin.assetUrl('kitty.png')`, `size` changed live (`pet.size`). Settings: `shown` (switch, default on) and
  `size` (Small 2×, Medium 3×, Large 4×, default 3×), both overridable by a workspace; strings in `en` and `zh-CN`.
  The template's view and logo are gone; README for users and developers; the workflow runs `bun run test`.
- **The stage:** a press on the kitty now also takes the mouse events that come of it (`mousedown`, `mouseup`,
  `click`, `dblclick`, `contextmenu`): an editor listens to `mousedown`, which stopping `pointerdown` doesn't stop.
  Each press decides again, so a press elsewhere after a throw isn't taken.
- **Checked** in `tauri dev` (a harness in each window; the build's `plugin.zip` staged from a local URL, as a folder
  outside the window's reach can't be staged without the picker), with native mouse events: the kitty sat on the
  session window's bottom edge, over the sidebar; a click on it reached none of the document's listeners, a click in
  the editor area reached them all (`pointerdown`, `mousedown`, `mouseup`, `click`); dragged up and let go, it flew
  and landed at the bottom right; a click on it hopped it with a heart. Size 4× took effect without a reload; `shown`
  off removed the canvas, on brought it back. Not checked: the Settings page's drawing of the two fields.
- **Found:** this shell's `rustc` is 1.81 (`/usr/local/bin`), too old for Vertex; `tauri dev` ran with
  `RUSTC=$(rustup which rustc)`. The overlay's canvas can't be read back (`getImageData`): the sheet comes from
  another origin, which taints it. Nothing needs it.

## F2: Out on the desktop

Needs Vertex: a plugin window with no frame, and moving it. An SDK minor (1.7.0) and a Vertex beta.

### Change
- **Vertex, the manifest:** `ownWindows[].bare` (name open): no frame, no title bar, no shadow, see-through, not in
  the taskbar or the Dock's window list; the plugin draws all of it. The install dialog's line about windows is
  enough.
- **Vertex, the contract:** `WindowProps.window.setPosition(x, y)` and `position()`, in screen pixels. Nothing else
  new: `setAlwaysOnTop` and `setSize` exist.
- **Vertex, the page:** a bare window draws the plugin's UI alone, on nothing.
- **The plugin:** Let the kitty out / Call it back (palette, and by dragging it over the window's edge if F2's
  spike allows); on the desktop its world is the screen, its floor the screen's bottom edge (above the Dock or
  taskbar); a pin for always on top, on by default; its place remembered.
- Docs (`context.md`, `package.md`, `versions.md`), tests for the manifest key and the kernel's plan.

### Acceptance
- [x] The spike first: a bare see-through window moved every frame is smooth on macOS; what Windows and Linux do is
  written down, tried or not.
- [x] The kitty leaves the window for the desktop and comes back; it stays on top of other apps while pinned; it
  goes when its workspace window closes.

### As built
- **Vertex, the kernel:** `OwnWindow.bare` and `WindowPlan.bare`; the route carries `&bare=1`. A bare
  window: no shadow, out of the taskbar and the Dock's window list (`skip_taskbar`), its first click the plugin's
  (`accept_first_mouse`, macOS). On Windows and Linux it has no decorations. On macOS it keeps them, with its traffic
  lights hidden (`hide_window_buttons`, `objc2` on the main thread): the first try (`decorations(false)`) crashed the
  app, as decorum (the app's title bar plugin) places every window's traffic lights on opening and on each resize
  and dereferenced the missing ones (`cocoa` `superview`, a null-pointer panic). The title bar is the see-through
  overlay the other windows have, so nothing of it shows. Test: `a_bare_window_says_so_to_its_page`; 44 kernel
  tests; clippy as before (two old warnings).
- **Vertex, the contract:** `ownWindows[].bare` (validated as a boolean; the manifest test); `WindowProps.window`
  gets `position()`, `setPosition(x, y)` and `workArea()` (the monitor's work area), logical pixels. `workArea` is
  more than the plan named: the floor above the Dock needs it. The page (`plugin-window/[plugin]/[id].vue`) drops
  its bar and background, and the document's, for a bare window. Docs: `context.md`, `package.md`, `versions.md`
  (1.7.0). Vertex's typecheck at its 7, 397 tests, lint clean; the SDK's 8.
- **The plugin:** `ownWindows: [{id: desk, 192×192, not resizable, bare}]`; Let the kitty out on the
  desktop / Call the kitty back (palette); `Desk.vue`: the stage with `desk` (its world the work area, the window
  2× the sprite moved to keep the kitty at its bottom middle, one `setPosition` in flight at a time, drawn against
  the place the window has reached; the pointer read from the screen, `screenX`/`screenY`, so a drag doesn't feed
  back through the moving window); the overlay hides while it's out. Where it settles goes back to the session
  window every 2 s when it changed and is kept in `ctx.data.global` as a share of the screen's width. `onTop`
  (switch, default on) applies live. The plugin builds against the local SDK (`file:../vertex/packages/vertex-plugin`)
  until 1.7.0 is published.
- **Checked** in `tauri dev` (harnesses in the session and Settings windows; `plugin.zip` from a local URL; native
  mouse events; a sampler reading the window's place from `CGWindowListCopyWindowInfo` every 2 ms): the window opened
  frameless and see-through, the kitty on the screen's bottom edge, the window's overlay kitty gone. With Finder in
  front, a drag from the kitty held it by the scruff under the pointer across the screen (a screenshot at the
  pointer showed its head there) and the throw landed on the floor; the window moved 179 times in 3.8 s, median 17 ms
  apart (60 a second), 90th percentile 32 ms, at most 31 px a move. Window level 5 with `onTop` on, 0 off, 5 again
  on, live. Call back: the window gone, the overlay kitty back. Out again: placed near where it had landed
  (`furball.json` held `x` 0.286). Closing the session window closed it. **Not judged:** smoothness by eye (the
  numbers only); Windows and Linux not tried (no `decorations` there, so decorum's macOS code doesn't run; whether a
  see-through borderless window moved every frame is smooth there is open).
- **Found:** the first click on a window of an app in the background only brought the app forward (fixed with
  `accept_first_mouse`). A plugin window has no `data-get`, so its own state goes through the session window, as
  designed. A kitty left alone sleeps after 45 s, so the window stops moving: not a stall.
- **Not done:** letting it out by dragging it over the window's edge; the window keeps its size when Size changes
  while it's out (it's set on opening).

## F3: Things to do

### Change
- **Furball's API** (`ctx.provide`): a source of things (`{id, label, items, done(id), open(id)}`, each item a title,
  a time and whether it's late), `cheer()`, `nudge(text)`. Typed in a file other plugins can copy; `ctx.use` isn't
  typed for community plugins.
- **The pet:** holds up the next thing; a poke opens the list as a bubble; a tick there and the row is eaten;
  restless while something is late; asleep with nothing left. The last one of the day gets the bigger cheer.
- **Tasks 0.2.0:** feeds Furball its agenda when Furball is on; an alert makes the kitty hop and hold the task up.

### Acceptance
- [x] With Tasks on: the next task is held up; ticked from the bubble, it's done in its file; a late one makes it
  restless; without Tasks, Furball is still a pet.

### As built
- **The API** (`src/api.ts`, copied into Tasks as `src/furball-api.ts`): `FurballApi` (`source`, `cheer`, `nudge`),
  `FurballSource` (`id`, `label`, `items()`, `done`, `open?`), `FurballThing` (`id`, `title`, `when?` already worded,
  `late?`), and `PluginApis.furball` declared on `@type32/vertex-plugin`, so `ctx.use('furball')` is typed (Tasks'
  typecheck proves it). `src/things.ts`: the session window's sources, `things` (late ones first), `shout` (cheer or
  a text to hold up), `api`, provided in session windows only.
- **The pet:** `cat.ts` gets `busy` (doesn't fall asleep on its own), `restless` (fidgets: a startle at half its
  decisions, and wakes after 4 s asleep), `eat(last)` and `cheer(big)` (higher hop, seven hearts); one more test
  (busy stays awake, restless fidgets and wakes). `stage.ts`: `onPoke`, `local()` (its feet in canvas pixels).
  `PetView.vue`, drawn by the overlay (`Kitty.vue`) and the desk window (`Desk.vue`): the canvas, a sign over its
  head (the next thing, red when late, or a nudged text for 10 s; hidden asleep, held or falling) and, on a poke,
  the bubble (things by source, a checkbox and a title each), both placed every frame. The desk window grows to
  272 px wide and the bubble's height taller while it's open; the session window sends it `{things}` and `{shout}`
  and does its `{done}`/`{open}`.
- **Tasks 0.2.0** (its commit `dfc7e2d`, not pushed or released): `src/furball.ts` feeds Overdue and Today (the agenda's rows,
  `when` worded by `formatTime`, `late` for Overdue), a tick completes (`completeEntry`), a title opens
  (`openTask`); started per session in its scope through `whenPlugin`. An alert also nudges the kitty with the
  task's title. `requires` adds `furball?`; README. Its typecheck, 20 tests, build.
- **Checked** in `tauri dev` (both plugins from their `plugin.zip`; a `.task` file with one task due yesterday and one
  due 2.5 minutes later; native clicks): the kitty held up "Draft the brief" in red; at the second task's due minute
  the sign turned to "Call the vet" (the alert's nudge); a click on the kitty opened the bubble with both; a tick on
  the first wrote `done` and `completedAt` to the file, the row went, the kitty chomped with crumbs. Let out with one
  task left: the desk window held it up; a click grew the window from 192×192 to 272×256 with the bubble; the tick
  there wrote the task done in the file, and the window shrank back and was high in a hop. With Tasks turned off and
  the window reloaded: the kitty there, no sign, no Tasks commands. **Not checked:** the restless fidgeting by eye
  (the test covers it), the big cheer's hearts in a picture (the hop was caught, not the hearts), a nudge while out.
- **Found:** turning a plugin off doesn't stop it in open windows (by design, until the app restarts), so its
  source stays with Furball until then. A synthetic `click()` on the bubble's checkbox right after a poke was taken
  by the stage (the last press was the kitty's); a real click's `pointerdown` decides again, so people never hit it.
  Tasks' own `node_modules` had SDK 1.6.0's files under 1.6.1's `package.json`; a reinstall fixed it.

## F4: Release

- The user's sheet in place of the placeholder; README with the sheet's layout; version, `minAppVersion` the beta
  with F2; tag from the workflow.

### Acceptance
- [ ] Installed from its release, on the user's machine.

### As built
- **The user's calls (19 Nov):** release with the placeholder sheet (theirs in a later version), `minAppVersion`
  `1.0.0-beta.1`, tag now, Tasks 0.2.0 tagged too. Asked with the risk named: a Vertex without F2 refuses the
  manifest (`"ownWindows"[0] has unknown keys: bare`); `1.0.0-beta.1` builds from before 22eacbf are such.
- **Furball 0.1.0:** on the published SDK (`^1.7.0`, the user's release `7e6ba8f`); README with the sheet's layout
  (32×32 cells, 5×7, row by row, feet bottom middle, walking facing right). Fresh clone: install with the lockfile,
  typecheck, 3 tests, build. Tag `v0.1.0` pushed; the workflow made the release with `plugin.zip` (kitty.png,
  locales, main.js, plugin.json with `bare`, README, styles.css):
  https://github.com/Type-32/vertex-plugin-furball/releases/tag/v0.1.0
- **Tasks 0.2.0:** fresh clone the same (20 tests); tag `v0.2.0`, released with `plugin.zip`:
  https://github.com/CTRL-Neo-Studios/vertex-plugin-tasks/releases/tag/v0.2.0
- **Not run:** an install of either release in the app (the acceptance, the user's).

## Open questions

1. Two workspace windows open: two kitties (a plugin window belongs to one session window), or one?
2. Several screens: does it stay on the one it was let out on?
3. See-through windows on Windows and Linux: not tried.
4. Does a bare window that follows the pointer need the kernel to read the cursor (eyes following it across the
   screen), or is following it only while it's over the kitty enough?
5. The sheet's cell size: 32×32 is the placeholder's; the user's style may want another.
