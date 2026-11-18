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

Mine, for the user to change. The first and fifth rows, and W2 and W3, were rewritten on 18 Nov when the user chose
the smaller shape (Open questions, 1): the watch stays the fs plugin's; Rust describes paths.

| Question | Decision |
| --- | --- |
| What moves to Rust | What the page asks of the disk about a batch's paths: what each is now (gone, a file, a folder, its size and times, its name as its folder lists it), in one call (`describe_paths`). The watch stays the fs plugin's, and the index stays in the page, reactive, where everything reads it. |
| What stays in the page | What a batch does to the index, as one synchronous pass, and which files are text worth reading (`isIndexedText`: plain text, YAML, and whatever a plugin registered a link extractor for, which only the page knows). The page reads those in one `read_text_files_batch`: two round trips a batch, not two a file. |
| The disk decides | A path in a batch is described as the disk has it when the batch is made, whatever kind the event had. The kind is used for one thing: pairing a rename's two paths, which keeps a file's uuid, and so its tab. |
| Batching | In the page: the fs plugin's events (each path, the kind, and a rename's two paths when it pairs them) gathered until 100 ms pass with none, a constant to tune. A batch is applied whole before the next is gathered. |
| One pass in the index | New `addEntries` (entries shaped as the scan's, with their text) beside `removeFileFromIndex` and `moveFileInIndex`: the batch's renames, then removes, then adds, then changed notes, with no `await` between, then the events (`rename`, `remove`, `create`, `modify`: unchanged for listeners, one an item, a folder's for the folder), then `changed` once with every path. |
| A folder that arrives | Scanned whole (`scan_directory_recursive` on it) and added in the same pass. |
| Vertex's own bulk adds | The same `addEntries`: the undo of a delete, `addTree`, a paste, an import. |
| Self-writes | As today (the 1.5 s window). Comparing with what the index holds would need the index to keep the disk's times after its own saves; not this plan. |
| The fs plugin's watch | Stays: the index uses it as now, with its own debounce (50 ms) and its pairing of renames. |
| Who may describe | `describe_paths` is reach-gated like `read_text_files_batch` (`paths`), and only session windows are granted it. |
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
- [x] An undo of a deleted folder of 2,000 notes is in the index within 1 s, with no frame over 200 ms (W0's number
  beside it). (218 ms, the longest frame 174 ms; W0: 181.5 s. Every entry back with the uuid it had, links to them
  resolving.)
- [x] Tests for the batch's plan; the index's existing behaviour unchanged (the scratch plugin of the Navigator
  Plan's Gaps: the same events for create, relocate, remove, undo). (`watchBatch.test.ts`, 9 cases; one caught the
  plan adding again what a renamed folder took along. The events, logged from the page instead of a plugin: a
  `create` each for a folder and two notes, one `rename` for a note moved and one for the folder renamed, one
  `remove` listing the folder and its note, a `create` each on undo, parents first.)

### As built (18 Nov)

- **`addEntries(entries, texts, uuids?)`** (`useActiveWorkspaceIndex`): one synchronous pass; a folder that was there
  lists what arrived in it once a folder, not once an arrival. `buildIndex` builds through it (1.5 s at startup, as
  before). `ScannedEntry` (`shared/types/active/workspace.d.ts`) is the scan's entry, typed for both.
- **`addPaths(paths, root, uuids?)`:** each path described (`stat`, and `scan_directory_recursive` for a folder), the
  text read in one `read_text_files_batch`, one `addEntries`, a `create` per entry. `addFileToIndex(path)` is that
  for one path, so a folder is indexed with what's in it, whoever adds it.
- **Who uses it:** the undo of a delete (`fromTrash`, with the uuids), a merged folder put back, the vault's move out
  of a dot folder (`addTree` is gone). An import and a duplicate write many files over time, so they add in passes
  (`indexingAsWritten`): when done, and about twice a second on the way, which keeps each file in the index before
  the watcher stops skipping its events as the app's own (1.5 s).
- **`planBatch`** (`shared/utils/index/watchBatch.ts`): pure, for W3. Nothing calls it yet.

| | W0 | Now |
| --- | --- | --- |
| A deleted folder of 2,000 notes undone | 181.5 s, 143 s blocked | 218 ms, longest frame 174 ms |
| A folder of 2,000 notes duplicated | not run (an add an entry, as the undo was) | 2.7 s, most of it copying; longest frame 170 ms |
| A folder of 50 notes and a subfolder moved in from outside | the folder's entry only | all 53 entries in one pass, 87 ms; links to them resolve |
| 500 notes created outside in a new folder | 45.5 s | one pass, longest frame 92 ms (the folder's event scans it) |
| 500 notes created outside in a folder that's there | (the 45.5 s row, as measured then) | 41.5 s: unchanged, W3's |
| `rm -rf` of a folder of 500 notes | 25.6 s | 25.9 s (439 `remove` events), and 28.8 s (457) after the row above: unchanged, W3's |

The delete first read 54.7 s here (467 events, 117 ms each, one frame of 33.5 s), put down to a larger index. The
user asked whether that wasn't slower than W0's. It was, and the reason given was a guess: measured again on W2's
code in a fresh run, W0's sequence gave 25.9 s and W1's own sequence, at 14,306 entries, 28.8 s; one entry removed
costs the page 63 to 67 ms after each of W1's steps, as one added does (60 to 75 ms). The 54.7 s run wasn't
reproduced and its cause isn't known (one run, with the machine in use). A number that surprises is measured twice
before it's written here.

A single-file window, whose one file is now read with `read_text_files_batch`: its note indexed with its properties,
icon and tags, the other file of its folder not; edited outside, the tab and the entry followed.

Not run: an import (a drop from Finder, a paste), which goes through the same `indexingAsWritten` as the duplicate.

## W2: Describing paths in Rust

### Change
- `describe_paths(paths)` in the kernel's crate (`lib.rs`): for each path, `entry` (as the scan's, without
  `children`) or none. Its name as its folder lists it (each folder listed once a call), so on a disk that ignores
  case a path asked as `note.md` finds `Note.md`. A link is what it leads to; one that leads nowhere is gone.
  Reach-gated (`paths`), granted to session windows.
- The page: `describePaths` in `useActiveWorkspaceIndex`, the entry's path set from its listed name. `addPaths` uses
  it (one call for all its paths, not a `stat` each).

### Acceptance
- [x] A Rust test on a temporary folder: a file, a folder, a missing path, a link that leads nowhere, a path asked in
  another case. (`paths_are_described_as_the_disk_has_them`; the case is asserted either way, by what the disk does.)
- [x] In `tauri dev`: Vertex's own create, undo and duplicate as in W1, through `describe_paths`. (The same events as
  W1's, uuids back after the undo; the undo of the 2,000-note folder and its duplicate whole, links resolving. Timed
  with DevTools on this time, so 0.4 s and 5.5 s, not W1's 0.2 s and 2.7 s. In the page, `describePaths` of
  `Bulk/bulk 3.md` gave `Bulk/Bulk 3.md`; adding `area 0`, which is indexed as `Area 0`, added nothing.)

### As built (18 Nov)

`describe_paths` (`lib.rs`, with `entry_of`, which the scan uses too), registered in `build.rs`, the handler and the
reach gate's path arguments, granted to session windows (`grants.rs`). `describePaths` in the index, and `addPaths`
on it. 64 Rust tests.

## W3: The page on batches

### Change
- `startWatcher` gathers the fs plugin's events (100 ms of quiet), then for each batch: `changed`, `session.watch`
  listeners and the settings' reload as now; `describePaths` on the batch's paths (not under a dot name); `planBatch`
  (W1); one pass: the moves, the removes (a `remove` event for each outermost item: a folder deleted outside is one
  event listing what it held, as a delete in Vertex is), `addPaths` for the adds, the reads in one
  `read_text_files_batch` with a `modify` each. Batches apply in order.
- `handleWatchEvent` and its 100 ms wait for a lone rename go: a rename of case shows as a path whose listed name
  differs.
- A single-file window: the same, adds nothing (`planBatch`'s `wholeFolder`).

### Acceptance
- [x] The baseline's three rows: the index current within 1 s of the last write, no frame over 200 ms. (The first,
  rewrites, already is since the four fixes: W0.) (Below: the slowest 0.85 s from the start of the writes, the
  longest frame 125 ms.)
- [x] A folder of notes moved in from Finder is indexed with its notes; moved out, gone with them. (In since W1.)
  (`mv` from a folder outside: 53 entries, links resolving; out again: none.)
- [x] A note renamed outside keeps its tab; a rename of case only is seen; a note edited outside reloads its tab; a
  file made and deleted within the same second leaves nothing. (The shown note renamed with `mv`: one `rename`, its
  tab still shown. Then to another case through a temporary name, two `mv` within one batch: one `rename`, the tab
  kept. Rewritten from the shell: the editor showed the new text and properties. `echo x > Blink.md; rm Blink.md`:
  not in the index.)
- [x] Vertex's own save, rename and delete raise no second event from the watch. (Logged for 2.5 s after each: the
  save none, the rename its one `rename`, the delete its one `remove`, the undo its one `create`. Found here: the undo
  of a delete is a rename out of the trash, which the app marks only at its target, so it also arrived from the
  watcher as a `modify`. A rename onto a path the app just wrote is now the app's own.)
- [x] A single-file window: its file edited outside reloads, deleted closes the window. (A file created beside it
  wasn't indexed.)
- [x] Git's view, the property types and chats stored in the workspace still follow what changes under `.git/`,
  `.vertex/` and `.obsidian/`. (A `changed` with `.git/HEAD`, `.obsidian/types.json` and the chat's file, and
  `watchUnder('.vertex/chats/')` called with the chat's file. What those listeners do with them is unchanged and
  wasn't run.)

### As built (18 Nov)

- **`startWatcher`** gathers the fs plugin's events: every path for `changed` (the app's own writes too, as before),
  the rest for the index, a rename's two paths as a pair; `BATCH_QUIET` (100 ms) with none, then `applyBatch`, in
  order. Its stop clears a waiting batch.
- **`applyBatch`:** `changed`, `watchUnder` and the settings' reload once a batch; `describePaths`; `planBatch`; the
  texts of the changed notes in one call; moves, removes and reads with no `await` between; then `addPaths`.
- **`handleWatchEvent`, `reparse` and the 100 ms wait for a lone rename are gone,** and the fs plugin's `stat` and
  `readDir` with them.
- **`planBatch`** follows renames chained in one batch (`a` → `b` → `c` is one move; and back is none). Found by
  reading it while checking the case rename, not seen in the app (the fs plugin gave those two `mv` as one rename):
  the second rename's source wasn't in the index yet, so it was taken for an add. Tested (10 cases).
- A rename also re-reads its file (a `modify` after the `rename`): the batch names the new path among its changes.
  Harmless (a tab reloads the same text); not changed.

| From outside, 13,302 entries, DevTools off | W0 | Now |
| --- | --- | --- |
| 500 notes rewritten | 20.3 s (0.43 s after the fixes) | 0.42 s from the first write, longest frame 46 ms |
| 500 notes created in a folder that's there | 41.5 s | 0.5 s, longest frame 119 ms |
| 500 notes created in a new folder | 45.5 s | 0.43 s, longest frame 125 ms |
| `rm -rf` of that folder | 25.6 s, frozen throughout | 0.85 s, one `remove`, longest frame 105 ms |
| Those 500 in a folder that's there deleted one `rm` at a time | not run | 0.8 s, 500 `remove` events, longest frame 105 ms |

The writes themselves took 37 to 70 ms; the rest is the fs plugin's debounce (50 ms), the batch's quiet (100 ms) and
the batch.

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
