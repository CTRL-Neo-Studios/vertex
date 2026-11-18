# Watcher Plan

Asked for on 18 Nov, after the look into the workspace index and its watcher that followed the Navigator Plan
(`plans/Navigator Plan.md`, Gaps). The index's own slow spots found then are fixed (a folder moved in one pass, the
tags pattern, the tree's icon, a scan that skips what it can't read). What's left is how changes made outside Vertex
reach the index: one file at a time.

The Performance Plan (`plans/Performance Plan.md`, O1) dropped "batching watcher events" because 500 modify events
made no long task. That holds: the page stays responsive while they arrive. It didn't measure how long the index
takes to be current, nor files created or deleted, which do freeze the page.

Each phase ends reviewable on its own: `typecheck`, the tests, lint and the Rust tests clean, checked in `tauri dev`
on the workspace below.

## Baseline (18 Nov)

Measured during the investigation, before the four fixes; W0 has the same rows after them.

A generated workspace of 13,302 entries (12,000 notes, 29 MB of text, 301 folders), `tauri dev`, Nuxt DevTools off
(on, it adds about 200 ms to every change of the index, in dev only: it watches `useState` deeply).

| From outside Vertex | Until the index is current | The page |
| --- | --- | --- |
| 500 notes rewritten (a `git pull`) | 20.3 s (41 ms a note) | responsive (258 ms blocked in all) |
| 500 notes created | 51.3 s (103 ms a note) | blocked for 41 s of it |
| `rm -rf` of a folder of 500 notes | 27 s, as 425 `remove` events | one freeze of 14 s |

Why, measured in the same session:

- **One change of the index's keys recomputes what's derived from the whole index:** 69 ms for an entry added, 116 ms
  for one removed (the tree alone is 24 ms). The same 500 entries added in one synchronous pass: 80 ms until the next
  frame; removed in one pass: 72 ms.
- **Each file is its own IPC round trips:** `stat` 0.36 ms, `readTextFile` 0.43 ms, one after the other, with the page
  recomputing in between. 500 notes read in one `read_text_files_batch`: 16 ms, and 3 ms to parse them.
- 380 tests (58 files); 63 Rust tests; typecheck with the 7 errors in `@type32/latex2vue`.

## What's there today

- **The watch** is `@tauri-apps/plugin-fs`'s (`watch(root, handler, {recursive, delayMs: 50})`,
  `useActiveWorkspaceIndex.startWatcher`): `notify-debouncer-full` in the fs plugin, one message to the page per event.
- **The handler** (`handleWatchEvent`) takes one event at a time, in order: tells `changed` listeners (git, the
  property types, `session.watch` for dot folders) and reloads the workspace's settings when their file is among the
  paths; drops paths under a dot name; then acts by the event's kind: `remove` → `removeFileFromIndex`; `create` →
  `addFileToIndex` (a `stat`, and for a note a `readTextFile`); `modify` of kind `rename` with two paths →
  `moveFileInIndex`, with one path a 100 ms wait, a `stat` and a `readDir` to tell a rename of case from a new file;
  `modify` of data → a `stat`, then the note read again (`reparse`).
- **The kind isn't to be trusted:** macOS reports a file's recent events together, so a delete soon after a create
  arrives as a modify. Since 18 Nov the `modify` branch asks the disk; the other branches still believe the kind.
- **Vertex's own writes** are skipped by time: `markSelfWrite(path)` before a write, and events for that path are
  ignored for 1.5 s (`RecentWrites`).
- **A folder that arrives whole** (moved in from Finder, unpacked): `addFileToIndex` adds the folder's entry and not
  what's in it (`useWorkspaceVault.addTree` exists for that, for the trash only). Read in the code, not run: W0 checks
  it.
- **Vertex's own bulk operations** add one entry at a time too: an undo of a deleted folder (`fromTrash`) awaits
  `addFileToIndex` per entry, a paste or an import per file.
- **A single-file window** watches its one file, not recursively, through the same handler.

## Decisions

Mine, for the user to change.

| Question | Decision |
| --- | --- |
| What moves to Rust | The watch and what it finds out from the disk: which paths changed, what each is now (gone, a file, a folder, its size and times), which pairs are renames. One message a batch. Not the index: it stays in the page, reactive, where everything reads it. |
| What stays in the page | What a batch does to the index, as one synchronous pass, and which files are text worth reading (`isIndexedText`: plain text, YAML, and whatever a plugin registered a link extractor for, which only the page knows). The page reads those in one `read_text_files_batch`: two round trips a batch, not two a file. |
| The disk decides | A path in a batch is described as the disk has it when the batch is made, whatever kind the event had. The kind is used for one thing: pairing a rename's two paths, which keeps a file's uuid, and so its tab. |
| Batching | `notify-debouncer-full`, already a dependency of the kernel's crate (the plugins' folder watch), with its file-id cache (what pairs renames on macOS and Windows): a batch is what it hands over after 100 ms of quiet, a constant to tune. |
| One pass in the index | New `addEntries` (entries shaped as the scan's, with their text) beside `removeFileFromIndex` and `moveFileInIndex`: the batch's renames, then removes, then adds, then changed notes, with no `await` between, then the events (`rename`, `remove`, `create`, `modify`: unchanged for listeners, one an item, a folder's for the folder), then `changed` once with every path. |
| A folder that arrives | Scanned whole (`scan_directory_recursive` on it) and added in the same pass. |
| Vertex's own bulk adds | The same `addEntries`: the undo of a delete, `addTree`, a paste, an import. |
| Self-writes | As today (the 1.5 s window). Comparing with what the index holds would need the index to keep the disk's times after its own saves; not this plan. |
| The fs plugin's watch | Removed from the page and from the windows' permissions once nothing uses it (the index is its only user). |
| Who may watch | The command is reach-gated like `scan_directory_recursive` (`root` among its path arguments), one watch a window, dropped with the window. |
| The contract | `session.index.on` and `session.watch` behave as now, but a burst arrives as one batch: listeners run after the whole batch is in the index. No type changes. |

## W0: The numbers again

### Change
- The baseline's three rows measured again on this branch as it is (the four fixes are in), with the generator and
  the harness the investigation used, kept out of the repository.
- Two things read in the code, run: a folder moved into the workspace from Finder (are its notes indexed?), and an
  undo of a deleted folder of 2,000 notes (how long?).

### Acceptance
- [x] The table above with today's numbers, and those two results, in this plan. (Below.)

### Results (18 Nov)

The same workspace, generated again (13,302 entries), `tauri dev`, DevTools off, the four fixes in. The generator, the
page harness and the scripts are in `/tmp/vertex-watcher-bench` (`setup.sh` makes the workspace and the app's data
for the identifier `dev.ctrl-neo.vertex.bench`), out of the repository; the harness is copied into `app/plugins` for
a run and removed after.

| | Before the fixes | Now |
| --- | --- | --- |
| Index at startup | 1.7 to 1.9 s | 1.5 s |
| 500 notes rewritten outside (a property and a link each) | 20.3 s | 0.43 s, no frame over 27 ms |
| 500 notes created outside | 51.3 s, 41 s blocked | 45.5 s, 35 s blocked |
| `rm -rf` of a folder of 500 notes | 27 s, one freeze of 14 s | 25.6 s, frozen throughout (one frame of 25.7 s), 427 `remove` events |
| A folder of 50 notes and a subfolder moved in (`mv`) | not run | one `create`: the folder's entry only. Its 51 files aren't indexed and links to them don't resolve, until a relaunch |
| That folder moved out | not run | one `remove`, nothing left |
| A folder of 2,000 notes deleted in Vertex (to `.trash/`) | not run | 185 ms |
| That delete undone | not run | 181.5 s, the page blocked for 143 s of it |

- **Rewrites are no longer a problem.** They were slow because each changed a property, and any property change
  rebuilt the tree (the tree read every entry's `properties` for its icon). With the entry's own `icon`, a rewritten
  note costs under a millisecond, read one at a time as it is. The same three runs with the text unchanged, and with
  only links changed: 0.43 s each.
- **What's left is entries added and removed one at a time:** from outside (created, deleted), and by Vertex itself
  (the undo: 91 ms an entry).
- **A folder that arrives isn't indexed,** as read in the code.
- **Files' tree isn't what's slow** (the user's report while these ran: the tree took very long to show entries
  while scrolling, the app almost unresponsive). With the index idle and the folder of 2,000 notes open: 17 to 18 ms
  a frame over 120 frames at 300 px a frame and 40 at 1,500 px, none over 41 ms, a row under the middle of the tree
  in every frame, 26 to 39 rows in the page; opening the folder, 56 ms. The report matches the runs above: for
  minutes the index gained or lost an entry about every 90 ms, each rebuilding the whole tree. Scrolled by script
  (`scrollTop`), not by a trackpad.

### What the results change

W1 stands as written, and matters most: it's the undo's three minutes and what any batch needs.

W2 and W3 as written move the watch into Rust. The numbers don't ask for that much: 500 events crossing to the page
one by one cost 0.43 s all told, reads included. What costs is what the page does per event. A smaller shape gets the
same result (Open questions, 1): keep the fs plugin's watch, gather its events in the page for 100 ms, describe the
gathered paths with one new Rust command (what the disk has for each: gone, or file or folder, name as the folder
has it, size, times), then W1's plan and one pass. One command and its test instead of a watch with a lifetime of
its own; the fs plugin's pairing of renames stays as it is. What it gives up: the fs plugin's `watch` permission
stays, and events still cross one message each.

## W1: One pass in the index

In the page only. Nothing about the watch changes yet.

### Change
- `addEntries(entries, texts)` in `useActiveWorkspaceIndex`: the nodes, the link graph, properties and links for all
  of them, then one `syncLinks`; `create` events after. `buildIndex` builds through it (one way to make an entry).
- `fromTrash`, `addTree`, and the loops that add what a paste, a duplicate or an import made
  (`useActiveWorkspaceTools`, `useWorkspaceVault`) scan what they made and add it in one pass.
- What a batch does, as a pure function (`shared/utils/index/watchBatch.ts`, tested): from a batch and what the
  index knows (which paths, which are folders), the renames, removes, adds and reads to make, self-writes left out,
  nothing under a dot name, a path both gone and back treated as changed, a rename whose source isn't indexed as an
  add.

### Acceptance
- [ ] An undo of a deleted folder of 2,000 notes is in the index within 1 s, with no frame over 200 ms (W0's number
  beside it).
- [ ] Tests for the batch's plan; the index's existing behaviour unchanged (the scratch plugin of the Navigator
  Plan's Gaps: the same events for create, relocate, remove, undo).

## W2: The watch in Rust

In the kernel's crate only. The page doesn't use it yet.

### Change
- `watch_start(root, recursive, onBatch)` and `watch_stop` (`watch.rs`): one debounced watch a window, replaced by a
  second call, dropped with the window (`windows::destroyed`) and with `watch_stop`.
- A batch: `paths` (every path the events named, dot paths too), `renames` (`from`, `to`, both paths of one event,
  the target there), `entries` (each other path not under a dot name, once: gone, or its name as the folder has it,
  folder or file, size, created, modified). A path whose event was a rename with no pair gets its real name from its
  folder's listing, so a rename of case is seen.
- The batch is made by a function of the events and the disk (`batch_of`), tested on a temporary folder: create,
  modify, delete, a create then a delete in one batch, a rename, a rename of case, a folder with files, dot paths, a
  link that leads nowhere.

### Acceptance
- [ ] The Rust tests; a window that closes leaves no watch (checked by a second window's batches going on alone).

## W3: The page on batches

### Change
- `startWatcher` calls `watch_start`; each batch: `changed`, `session.watch` listeners and the settings' reload as
  now, then W1's plan, one `read_text_files_batch` (and a scan for each folder that arrived), one pass, the events.
  Batches apply in order.
- `handleWatchEvent`, the 100 ms wait and the fs plugin's `watch` go; the session windows' permission for it
  (`plugin:fs|watch`) goes with its ACL test.
- A single-file window: the same, not recursive, adds nothing.

### Acceptance
- [ ] The baseline's three rows: the index current within 1 s of the last write, no frame over 200 ms. (The first,
  rewrites, already is since the four fixes: W0.)
- [ ] A folder of notes moved in from Finder is indexed with its notes; moved out, gone with them.
- [ ] A note renamed outside keeps its tab; a rename of case only is seen; a note edited outside reloads its tab; a
  file made and deleted within the same second leaves nothing.
- [ ] Vertex's own save, rename and delete raise no second event from the watch.
- [ ] A single-file window: its file edited outside reloads, deleted closes the window.
- [ ] Git's view, the property types and chats stored in the workspace still follow what changes under `.git/`,
  `.vertex/` and `.obsidian/`.

## W4: Close

### Change
- `Concepts and Structures.md` (the workspace index, the watch), `SMOKE.md` rows for W3's acceptance, the
  Performance Plan's O1 line on batching pointed here.

### Acceptance
- [ ] The before and after table in this plan.

## Not in this plan

- **The scan's parsing in Rust.** Startup's index is 1.6 s in dev for 12,000 notes after the tags fix, about a third
  of it the debug build serialising JSON (12 ms in a release build). Frontmatter (YAML) is the largest part left. A
  Rust parser would be a second implementation to keep equal to the page's, and plugins' link extractors still need
  the text in the page.
- **A cache of the index on disk.**
- **Self-writes by comparison** instead of by time (Decisions).
- **Windows and Linux runs:** no machine here.
- **The index out of `useState`,** which would take DevTools' 200 ms a change out of dev.

## Open questions

1. **The watch in Rust, or one command?** Raised by W0 (What the results change), to decide before W2. As planned:
   `watch_start` in Rust, batches made there. Smaller: the fs plugin's watch stays, the page gathers its events, one
   Rust command describes the gathered paths. Recommended: the smaller one. W1 is the same either way.
2. **100 ms of quiet** before a batch: long enough to gather a `git checkout`, short enough that an edit in another
   editor shows at once? W3 measures both and may change it.
3. **`session.index.on` during a burst:** a listener gets 500 `modify` calls in a row after the batch. Is a batch
   event (`{type: 'batch', events}`) wanted for plugins that redraw per event? Not added unless a plugin needs it.
