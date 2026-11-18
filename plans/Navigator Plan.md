# Navigator Plan

S6 of the Sample Plugins Plan (`plans/Sample Plugins Plan.md`), planned apart on 18 Nov at the user's word: the
navigator isn't a second file tree, as S6 first had it, but a notes browser in two panes, after Obsidian's Notebook
Navigator ("Apple Notes' sidebar, pro plus max ultra"; the user's three screenshots). Too much for one phase.

A community plugin, written as an outside author would write one: its own repository beside Vertex
(`../vertex-plugin-navigator`, `CTRL-Neo-Studios/vertex-plugin-navigator`, id `navigator`), on the published SDK,
importing nothing of Vertex's but the SDK's modules. A gap it finds is closed in Vertex's contract first (the Sample
Plugins Plan's rule) and gets a row under Gaps here.

Each phase ends reviewable on its own: the sample building, type-checking and its tests passing; Vertex's `typecheck`,
tests and lint clean when Vertex changed; checked in `tauri dev`.

## What it is

Two panes in one panel view (`navigator`, first in the left sidebar, also openable in a tab):

- **The navigation pane:** Shortcuts, Recent files, the workspace's folders (folders only, each with its count), Tags
  (nested by `/`, with counts and Untagged), Properties (each property in use, its values under it).
- **The list pane:** what the chosen folder, tag or property value holds, each file a row: its name, two lines of its
  text, its tags, its date, a thumbnail; Pinned first, then by date (Today, Yesterday, Previous 7 days, Previous 30
  days, then months, then years), each group folding. Its header: Back (one pane), the name, Search, Include
  subfolders, Sort, Appearance, New.

## Decisions

The user's, 18 Nov (the questions asked before this plan), unless marked mine.

| Question | Decision |
| --- | --- |
| Shape | Two panes after Notebook Navigator, not a tree of files. |
| Navigation sections | All five: Shortcuts, Recent files, Folders, Tags, Properties. |
| A row | Preview text, tag pills (a click goes to the tag), the date, a thumbnail (an image file itself, or a note's first embedded image), date groups. |
| Layout | By width: one pane with Back when narrow, both side by side when wide. In a tab the list is a grid of cards, not one column. |
| Header tools | Search (filters the list by name and tag), Include subfolders (per folder), Sort (name, modified, created, each way; per folder or tag), Appearance (the folder's or tag's colour and icon), New (the kernel's New items, in that folder). No full-text search. |
| A drop on a tag | Adds the tag to the notes' frontmatter, one step of Files' undo. |
| What the list holds | Every file, with a setting for notes only. |
| Left out | The calendar, folder notes, hidden files, renaming a tag across the vault, row appearance per folder. |
| Where state lives (mine) | What's the vault's goes in `ctx.data.workspace`, by workspace-relative path: shortcuts, pins, colours and icons, sort, include-subfolders. What's this device's goes in `ctx.data.global`, by the workspace's root: recent files, what's chosen, what's folded. Open folders are the session's (`session.files.openFolders`, shared with Files). |
| Pins (mine) | A note is pinned or not, wherever it's listed (Notebook Navigator pins per folder and per tag). |
| Renames (mine) | Paths in the workspace's data follow renames and moves, by uuid (first planned on `session.index.on('rename')`, which Vertex's own renames don't raise: Gaps). A deleted item's data stays (an undo brings the item back with it); what names nothing isn't shown. |
| Icons (mine) | A folder's or note's own `icon` (Vertex's, from its properties) shows unless the navigator's data gives it one. An icon is typed as an Iconify name, with a preview and a few suggestions: no icon picker. |
| Colours (mine) | Eight swatches and the system's colour picker (`<input type="color">`), stored as CSS colours. |
| Long lists (mine) | The list draws 100 rows and more as it's scrolled; previews are read (`vault().read`) for drawn rows only, kept by path and modified time. No virtual list: rows differ in height and the tab's grid wraps. |
| Width (mine) | Both panes from 560 px, a setting (`dualPaneWidth`). |
| File operations | The kernel's, as Files': `session.files.menuFor`, `newItems`, `move`, `remove`, `copy`, `paste`, `importDrop`, `undo`, `redo`, `drag.start`. The navigator's own menu items (Pin, Add to shortcuts, Colour and icon) are a `ctx.files.menuItem`, so Files' menu has them too. |
| Folders' selection (mine, while building) | One folder at a time: the chosen one. The list selects many, as Files' tree does. |

## Gaps

Found while building, all closed in Vertex: the fourth and fifth on 18 Nov at the user's word, after the release, the
last the same day.

| What's missing | Today |
| --- | --- |
| A Nuxt UI component inside another's trigger (`UTooltip` > `UButton`) | Closed. The navigator's list threw the first time it drew: "null is not an object (evaluating 'currentRef.value.$el.nodeName')". Plugins get Nuxt UI's components lazy (`defineAsyncComponent`), a lazy one has no element while it loads (under the page's `<Suspense>`, Vue 3.5 keeps its placeholder off `vnode.el`), and Reka reads a trigger's child's `$el.nodeName` at once. No sample had put a component in a trigger before. `importPluginCode` now loads the components a plugin's code names (`namedIn`, `shared/plugin/modules.ts`, tested) before the code runs. |
| A plugin's dialog (`useOverlay`) in dev | Closed. `@nuxt/ui/composables` was pre-bundled by Vite for plugins (`SHARED_PACKAGES`) while the app's own code gets it as source: two copies, each with its own list of overlays, so a plugin's modal opened into one nothing draws. Dev only (a build has one module). Out of `optimizeDeps.include`, into `exclude` (`nuxt.config.ts`). |
| How a plugin gets the `yaml` that `setFrontmatterProperty` takes | Closed in the docs (the session page, `session.files.vault`): `obsidianYaml(frontmatterRange)`, `frontmatterRange` from the editor's package. |
| `session.index.on` doesn't hear what Vertex does itself | Closed (18 Nov, the user: "Need it"). Only the watcher's creates, removes and renames were events: Files' New, Delete, Rename and moves changed the index without one. The index's own mutators raise them now (`addFileToIndex`, `removeFileFromIndex`, `moveFileInIndex` in `useActiveWorkspaceIndex.ts`; the watcher's handler no longer does), so whoever changes the files, one event an item, a folder's for the folder; `broadcast` logs a listener that throws, so no file operation stops halfway. Checked in `tauri dev` with a scratch plugin calling `session.files`: `create`, `relocate` of a file and of a folder (one `rename` each), `remove` of a folder (one `remove` with its three entries), undo (a `create` per entry, then the `rename` back), with a second listener that always throws; from the shell, a rename, a create, a folder rename and a delete, one event each. Deleting the shown tab's file left the other tab shown. The navigator still follows renames by uuid, which works in either Vertex. |
| A moved or renamed file is "modified now" | Closed (18 Nov, the user: "Fix it"). `moveFileInIndex` gave each moved entry `modifiedTime: new Date()`; it keeps the entry's own now. Checked with the same plugin: a file moved, and a file inside a renamed folder, kept the time they had. |
| A file deleted outside Vertex seconds after it was made there stays in the index | Closed (18 Nov, the user: "fix that"). Seen during that check, not from these changes: `echo x > T2.md`, then `rm` four seconds later, reached the watcher as a `modify`, not a `remove` (macOS reports a file's recent events together), and the entry stayed. The watcher's `modify` branch asks the disk now (`stat`): a file that's gone leaves the index, one that isn't indexed joins it, one that's there is read again. Checked in `tauri dev`: a file made and deleted four seconds later, and one second later, both left the index; 500 notes made outside then `rm -rf`ed left it as it was. |

## N1: The two panes

### Change
- The repository from the template; `plugin.json` (`navigator`, a panel view in `left`, `tab: true`, workspaces only).
- `src/model.ts`, pure: a file's tags (frontmatter and body), the tag tree and its counts, properties and their values,
  what a selection lists, sorting (names compared as numbers where they're numbers), date groups, a date's label.
- The navigation pane: Folders (from `session.index.tree()`, open and closed with the session's `openFolders`), Tags,
  Properties, each section folding, counts on the right. A click chooses what the list shows.
- The list pane: rows with name and date, sorted and grouped; a click opens the file, the shown tab's row marked.
- One pane or two by the view's width; Back; what's chosen and folded kept in `ctx.data.global`.

### Acceptance
- [x] Folders, tags (nested, Untagged) and properties list a test workspace's files with the right counts; a note
  saved with a new tag shows under it without reopening anything. (In `tauri dev`, a workspace of 2,011 files: the
  folders' counts, `big` 2000 with `a`…`j` 200 each, `games` 3 over `101` and `150`, `notes` over `long`, Untagged 3,
  `status` 5 as `draft` 3 and `done` 2. `#fresh` written into a note from outside: `fresh 1`, Untagged 2, with nothing
  reopened.)
- [x] Narrow shows one pane with Back, wide both; what was chosen is still chosen after a relaunch. (The sidebar: one
  pane, Back. Open in tab at 992 px: both, the list three columns of cards. After a relaunch the list was Games'
  again, its Pinned group there.)

## N2: Rows

### Change
- A row's preview (the note's text without its frontmatter, code, comments and Markdown marks), tag pills (a click
  chooses the tag), thumbnail (an image file; a note's first embed that is an image of the workspace).
- Header: Search (name and tag), Include subfolders, Sort. In a tab, the list is a grid of cards.
- 100 rows at a time.
- Settings (the manifest's schema, each a workspace may change): notes only, preview lines (0 to 3), show tags, show
  dates, show thumbnails, group by date, recent files' count, the width for two panes.

### Acceptance
- [x] A note's row follows an edit of its text and tags; an image file and a note embedding one show thumbnails.
  (A note rewritten from outside: its row's preview, tags and time followed. `cover.png` and the note embedding it
  both drew it.)
- [x] A folder of 2,000 notes with Include subfolders opens and scrolls without a pause; in a tab the rows are cards.
  (100 rows 151 ms after the click, 100 more 151 ms after each scroll to the end. Settings, from `settings.json`:
  notes only dropped the image and the counts, one preview line, no tags.)

## N3: File operations

### Change
- Selection as Files' (click, Cmd/Ctrl-click, Shift-click, Cmd/Ctrl+A, Esc) in the list, with arrows and Enter; one
  folder at a time in the navigation (Decisions).
- Right-click: the kernel's menu for the rows, a folder, or the empty space; New in the list's header and the panel's.
- Keys: Delete, Cmd/Ctrl+C and V, Cmd/Ctrl+Z and Shift+Z.
- Drags: rows and folders drag out as Files' rows do (the editor, chat, Finder). Drops: on a folder or the list of a
  folder (move; OS files import), on a tag (adds it). A closed folder held under a drag opens.

### Acceptance
- [x] With Files off and the navigator in its place: create, rename, move, duplicate, delete, and undo each. (Files
  off in Settings' file, no Files view: New from the list's header made the note in the chosen folder; Rename and
  Duplicate from the menu; a real drag onto a folder moved it; Delete key; ⌘Z put each back, ⇧⌘Z redid the rename.
  New isn't a step of Files' history, in Files either.)
- [ ] SMOKE's Files rows that aren't about the tree's own look pass (listed in As built, each with what was run).
  (Run: the menus of a note, a folder and the empty space (91); a drag into a folder, and a closed folder opening
  under one (92); click, Cmd-click, Shift with arrows, ⌘A, Esc (96); copy and paste into another folder, Duplicate
  (102); a row dragged into a note's line made `[[Old]]` (104); undo and redo (106). Not run: the Update links prompt
  on a move (92), a name clash on a drop (100), drops from Finder (101), a drag onto a chat (103) and out to Finder
  (105). 97 and 99 are the tree's own.)
- [x] Notes dropped on a tag have it in their frontmatter; one undo takes it from all of them. (Two selected notes
  dragged onto `fresh` for real: `fresh 3`, each with it in `tags`; one ⌘Z: `fresh 1`, both files as they were.)

## N4: What the vault remembers

### Change
- Pins (Pinned group; Pin and Unpin in the menu), shortcuts (notes, folders, tags; Add to and Remove from shortcuts),
  Recent files (the last shown tabs' files), Appearance (colour and icon of a folder or tag).
- The data follows renames and moves.
- Commands: Show navigator, Reveal the shown file in the navigator.

### Acceptance
- [x] A folder's colour, a pin and a shortcut survive a relaunch, travel with the vault
  (`.vertex/plugins-data/navigator.json`), and follow a rename of the folder. (`Games/101` orange with a gamepad, a
  shortcut to it, `Rules` pinned: all in that file. Renamed to Basics from the menu: the file's keys became
  `folder:Games/Basics`, the row kept its colour; after a relaunch too. Not until the navigator followed renames by
  uuid: Gaps.)
- [x] Recent files lists the last shown files, newest first, and isn't written to the vault. (Fresher, Old, Inbox, in
  the app's data; the vault's file has no `recent`.)

## N5: Release

### Change
- Strings in `en` and `zh-CN`; `README.md` (what it does, what it shows of the plugin API); the release workflow.
- The docs: whatever the phases found; `Concepts and Structures.md` names the sample; SMOKE rows.
- The Sample Plugins Plan's S6 ticked with what this plan built.

### Acceptance
- [x] Installed from its release (`plugin.zip`), it runs in a release-identifier `tauri dev` with Files off. (The
  release's zip unpacked into the app's `plugins/navigator/`, not through Settings → Install…; a `tauri dev` with its
  own identifier, not a release build.)

## As built

- **Repository:** [`CTRL-Neo-Studios/vertex-plugin-navigator`](https://github.com/CTRL-Neo-Studios/vertex-plugin-navigator) (`../vertex-plugin-navigator`), release `v0.1.0` from its workflow (`plugin.zip` with `README.md`), on SDK 1.3.0. `main.js` 52 kB (15 kB gzipped), no dependencies.
- **The plugin:** `src/model.ts` (pure, 14 tests: tags, the tag tree, properties, lists, counts, search, sorting, groups, dates, previews, the vault's data read tolerantly, renames, `movesBetween`); `src/state.ts` (one per window: the two stores, recent files, renames by uuid, previews, pins, shortcuts, looks, `addTag`, the menu items); `src/navigator.ts` (one per view: the choice, what it lists, drops); `Navigator.vue`, `NavPane.vue` with `NavRow.vue`, `ListPane.vue`, `LookModal.vue` (through `useOverlay`); `main.ts` (the view, `ctx.files.menuItem`, Show Navigator and Reveal the Shown File). Strings in `en` and `zh-CN`.
- **Vertex:** `app/utils/plugins/community.ts` and `shared/plugin/modules.ts` (`namedIn`, `modules.test.ts`); `nuxt.config.ts`; the contract's comment on `index.on`; the docs (`session.md`: events and uuids, the frontmatter tools; `ui.md`: a plugin's dialog); `Concepts and Structures.md`. 380 tests (58 files); typecheck unchanged.
- **Not checked:** zh-CN on screen (the build checks its keys), the panel's Collapse all, Show Navigator (Reveal the Shown File was run from the palette), a shortcut to a property, a drag of a folder row, a custom icon typed by name, the system colour picker, and SMOKE's rows above.
- **Seen once, not explained:** a drag of two selected notes onto a tag that changed nothing, made a few seconds after an undo; the same drag worked twice afterwards (uuids stay through an undo, the drop was accepted). If a drop is ever lost, look at `dragged` in `src/navigator.ts` first.

## Not in this plan

- A calendar, folder notes, hidden files, tag renames, per-folder row appearance (Decisions).
- Full-text search: the palette's and Search's.
- Resizing the navigation pane, and a virtual list (Decisions: long lists).
