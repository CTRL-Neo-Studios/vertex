# Performance Plan

Big workspaces and long chats have to stay fast: no list may render every item, and no typing, streaming or autosave may re-render a list that didn't change. Precedent: the Git view's commit box shared a render with 500 file rows, about half a second per keystroke (fixed by `GitCommitBox` plus `useVirtualList`). The file tree also gets drag & drop.

Sizes to hold: a 10k-file vault (a 3k-note folder among them), a note with 300 headings and 1k backlinks, a 500-message chat with tool calls, 2k chats, a 20k-line diff, 2k branches, 800 fonts.

## Decisions

| Topic | Decision |
|---|---|
| Virtual lists | Nuxt UI's `virtualize` where the component has it (`UTree`, `UTable`, `USelectMenu`, `UCommandPalette`, `UScrollArea`); `useVirtualList` for fixed-height custom lists, as in the Git views. |
| Inputs | A text input never shares a render with a big list: its own component, or the list reads a debounced copy. |
| Per-row cost | One context menu per list (the right-clicked row remembered on `contextmenu`), not one per row; menus built when opened; `title` over `UTooltip` where a row needs only a hint. |
| Reactivity | Derived data copies only the fields it shows; writes that change nothing are skipped; library data stays raw (`markRaw`). |
| Root first | The workspace index (autosave → whole tree rebuilt about once a second) is fixed once in `useActiveWorkspaceIndex`, which covers the tree, backlinks, Bases and chat links. |
| Moves | Drag & drop and Rename share one move path (`moveFile`): the rename on disk, the index (uuids kept, so tabs and expanded folders follow) and the link update. Folder moves update links too. The link dialog always asks unless the workspace remembers a choice. |
| Long chats | Only the view is windowed (the latest 50 messages). The chat state, what the model gets, branches, undo and the context window keep using every message. |
| Not in scope | Files dragged in from Finder/Explorer (`dragDropEnabled: false` keeps HTML5 drag & drop working); multi-select. |

```mermaid
flowchart LR
  O0[O0 Baseline] --> O1[O1 Workspace index]
  O1 --> O2[O2 File tree]
  O2 --> O3[O3 Tree drag & drop]
  O1 --> O4[O4 While typing]
  O0 --> O5[O5 Large lists]
  O0 --> O6[O6 Chat]
```

## O0: Baseline

### Change
- A browser harness on the stubbed Tauri setup (as in the Git smokes): a 10k-file vault, a 300-heading note with 1k backlinks, a 500-message chat, a 20k-line diff, 2k branches. Measures `PerformanceObserver('longtask')` and keystroke-to-paint while typing in a note with Files, Outline and Backlinks open; opening and streaming in the long chat; opening the diff, Bases, the branch picker.
- Numbers go in this file (before / after per phase). Throwaway: not committed (the harness lives in the eval session, `/tmp/vertex-perf-harness.js`).

### Results (before)
Production build (`nuxt generate`) served statically, headless Chromium on an Apple Silicon Mac, CPU unthrottled, Tauri stubbed. Workspace: 10 003 files (`Big/` with 3000 notes, 70 folders of 100), 1000 notes linking to `Hub.md` (300 headings, 1200 lines), 500 changes plus a 20 000-line untracked file, 2001 branches, 2000 chats, one with 500 messages (a tool call in every third reply). Long tasks are main-thread tasks over 50 ms; "per key" is keydown to the next frame. The key floor is about 80 ms here with nothing open (headless frame pacing), so compare long tasks first.

| Scenario | Long tasks | Longest | Total | Note |
|---|---|---|---|---|
| Type 60 characters above the headings: Files (`F00` open, 100 rows) and Outline | 61 | 744 ms | 6.6 s | per key p50 4.0 s: input queues up |
| … Outline only | 60 | 186 ms | 5.8 s | about 97 ms per keystroke |
| … Files only | 1 | 778 ms | 0.8 s | one freeze per autosave |
| … Backlinks only (1000) | 1 | 130 ms | 0.1 s | |
| … nothing open | 0 | | 0 | |
| Switch tabs ×10: Files and Outline | 21 | 756 ms | 8.3 s | |
| … Files only | 10 | 731 ms | 7.1 s | about 700 ms per switch |
| … Chats (2000) only | 9 | 2169 ms | 19.2 s | about 2 s per switch |
| … nothing open | 0 | | 0 | |
| Open a workspace of 10 003 files, folders closed | 4 | 233 ms | | the index itself is fine |
| Open a workspace of 5000 files with the 3000-note folder open | 6 | 9759 ms | | grows with rows × files |
| Open the 3000-note folder in the 10 003-file workspace | | | | the renderer crashed (twice) |
| Open the 20 000-line new-file diff | 2 | 1012 ms | 1.1 s | 180 701 DOM nodes |
| Open Bases (10 004 rows) | 2 | 692 ms | 0.9 s | |
| Type 3 characters in Bases' search | 3 | 571 ms | 0.8 s | up to 846 ms per key |
| Open the branch picker (2001 branches) | 2 | 202 ms | 0.3 s | 13 rows drawn (capped); search typing fine |
| Open the 500-message chat (from load, with Chats) | 6 | 1745 ms | 4.7 s | |
| Type 3 characters in the chat prompt, 500 messages, Chats open | 3 | 1790 ms | 5.3 s | about 1.8 s per key |
| … 500 messages, Chats closed | 3 | 255 ms | 0.7 s | about 250 ms per key |
| … 40 messages, Chats open or closed | 0 | | 0 | |
| Stream 300 chunks (20 ms apart, 6.1 s) into the 500-message chat | 4 | 716 ms | 1.2 s | took 8.0 s; the request held all 586 model messages |
| … into a 40-message chat | 2 | 81 ms | 0.2 s | took 7.2 s |

Findings the surveys missed: typing in the chat prompt is the commit-box bug again (it grows with the messages and is worse with the Chats list open), and switching tabs with the Chats list open costs about 2 s. Both go into O6. Not measured yet: the font and vault pickers (O5), a burst of watcher events (O1; the stub has no watcher).

### Acceptance
- Each later phase shows its number before and after.

## O1: Workspace index churn

### Change
- Done: `fileTree` copies only what the tree shows (`UITreeNode` is now `uuid`, `fileName`, `relativePath`, `isFolder`, `icon`, `children`; `defaultUITreeNode` removed), so a save no longer rebuilds it.
- Done: `applyProperties` and `syncLinks` skip the write when the value is equal: a save that changes no property or link triggers nothing (backlinks and forelinks panels included).
- Done: `FileTreeComponent`: the workflow list is one `computed`, not a scan of the whole index per `.md` row.
- Done: `ChatLink` resolves through the link graph (`resolveLink` in `useActiveWorkspaceIndex`, reactive to files added, removed or renamed) instead of scanning every file per link.
- Dropped: batching watcher events. 500 modify events in a row, each changing the note's links, made no long task.

### Acceptance
- Typing in a note with Files and Backlinks open: no tree or backlinks render after an autosave that changed no link or property.

### Results (after)
| Scenario | Before | After |
|---|---|---|
| Type 60 characters, Files open | 1 long task, 778 ms | none |
| Type 60 characters, Backlinks (1000) open | 1 long task, 130 ms | none |
| Switch tabs ×10, Files open (`F00`, 100 rows) | 7.1 s, 731 ms each | 0.57 s, longest 71 ms |
| Open 5000 files with the 3000-note folder open | 9.8 s | 2.1 s |
| Open the 3000-note folder in the 10 003-file workspace | renderer crashed | 2.0 s |
| Switch tabs ×10 with that folder open | (crashed before) | 28 s, 2.8 s each: every row re-renders (O2) |
| Type 60 characters with that folder open | (crashed before) | none |
| Open the 500-message chat (from load, with Chats) | 4.7 s, longest 1745 ms | 2.9 s, longest 1401 ms |
| 500 watcher modify events (same text, or new links) | not measured | none |

Checked in the browser: a modify event that adds `icon:` to a note's properties shows the icon on its row, and chat `[[Hub]]` links resolve and open the note.

## O2: File tree

### Change
- Done: one `UContextMenu` around the tree. Rows carry `data-id` and `data-level`; a capture `contextmenu` listener picks the row's items before the menu opens, and outside any row it shows the panel's New items (`emptyMenu`, which `PanelFilesView` passes; its own menu and `UScrollArea` are gone).
- Kept: the active row still reads `activeTabUuid`. With about 40 rows drawn, a tab switch re-renders only those, so `v-model` / `data-selected` wasn't needed. The unused `v-model` (`activeTreeItem`, `StateKey.activeTreeItem`) is removed.
- Done: `UTree virtualize`. The tree is the scroll container (with the scroll fade). File rows get the indent from their level (flat mode only indents Nuxt UI's own link, which the folder rows keep). The nesting guides are a dotted line per parent level at that parent's icon. Keys stay uuids; keyboard navigation comes from reka.
- Dropped: revealing the active file. Nothing scrolls the tree to it today; adding it would be new behaviour.

### Acceptance
- A 3k-note folder expands, scrolls and switches tabs without long tasks; right-click, rename, keyboard arrows and expand/collapse work as before.

### Results (after)
| Scenario | After O1 | After O2 |
|---|---|---|
| Switch tabs ×10, Files (`F00` open) | 0.57 s, longest 71 ms | none |
| Open the 3000-note folder (10 003 files) | 2.0 s | none |
| Switch tabs ×10 with it open | 28 s, 2.8 s each | none |
| Scroll it (20 steps of 600 px) | not measured | none |
| Open 5000 files with it open | 2.1 s | one task, 96 ms |

Checked in the browser: indents and guides three levels deep (screenshot), the active row's bar and badge, right-click on a note (Run workflow on this note …), a folder, a workflow (Run, Dry run) and empty space (New note, folder, workflow), clicking a folder open, ArrowDown, End (to the last of 3000+ rows) and Home, the top fade after scrolling.

## O3: File tree drag & drop

### Change
- Done: rows are `draggable` and carry `data-id`; the listeners sit on the tree (ChatsPanel's pattern without its `MutationObserver`). Folder rows are their slot's element edge to edge (the link's vertical and end padding moved onto it), so the whole row drags.
- Done: targets are a folder row (into it), a file row (its folder) or empty space (the top level). Refused, with no highlight and no drop: the item itself, its descendants, and its current folder.
- Done: the highlight is the row's own overlay, read in the slot (`dropDir`), not part of the tree's items. The target folder's row and the rows directly in it light up; the top level rings the tree.
- Done: a closed folder held under the pointer for 600 ms opens; near the top or bottom edge the tree scrolls; state also clears on a window `dragend`. After a drop into a folder, that folder opens.
- Done: `relocateFile` in `useActiveWorkspaceTools` backs both `renameFile` and the new `moveFile(uuid, destDir)`: `markSelfWrite` on both paths, then `renamePath`/`movePath`, then `moveFileInIndex`, then the link update.
  - A folder gathers the links to every note inside it, so folder renames now update links too.
  - Only targets whose text changes count, so a note moved by `[[Name]]` needs nothing.
  - Linking notes are re-read by uuid, so ones that moved along still get rewritten.
  - A taken name refuses with a toast ("Could not move …").
- Done: link update choice. `UpdateLinksModal` closes with `{update, remember}`, and offers **Remember my decision for this workspace** in workspace windows. Ticked, the answer goes to the workspace's `fileConfig.updateLinks` (`'ask' | 'update' | 'keep'`, default `'ask'`, `'fileConfig': 'workspace'`). Settings → View → Files has the same choice per scope.
- Added: the tree's top level is sorted like every folder's children (`fileTree`). Before, a note moved or renamed to the top level showed up last until the next scan.

### Acceptance
- Drag a note into a folder, a folder into another folder, a file to the root; open tabs, the active tab and expanded folders follow; links to moved notes (including ones inside a moved folder) are offered for update and resolve after; dropping a folder into itself or its child does nothing.
- Remember ticked with Update: the next move in that workspace updates links without asking, another workspace still asks; setting it back to Ask in Settings brings the dialog back.

### Results
Checked in the browser (stubbed fs with rename and write, and workspace settings):
- `M0_1` dragged to the top level: the dialog listed `Links.md` with 1 link. Remember plus Update wrote `fileConfig.updateLinks: update`, and `[[F00/M0_1]]` and `[[F00/M0_1#Top|alias]]` became `[[M0_1]]` / `[[M0_1#Top|alias]]`. The open tab stayed.
- Folder `F01` dropped on `F02`: renamed to `F02/F01` without a dialog (remembered). `[[F01/M1_2.md]]` became `[[F02/F01/M1_2.md]]`, and `F02` opened to show it.
- Refused, with nothing lit: a note onto its own folder's note, `F01` onto its child, `F02` onto itself, and a top-level note onto empty space.
- `M1_2` held 900 ms over closed `F00`: `F00` opened and it and its rows lit. Keep (not remembered) left `Links.md` alone and wrote no setting.
- A note dropped onto `Hub.md`, and onto empty space, went to the top level, in sorted order.
- Folder `F00` renamed to `Archive` from the menu: the dialog offered its 1 link. Remember plus Keep wrote `keep`, and the next move that changed links didn't ask.
- Settings → View → Files in the workspace scope: "Changed in this workspace" and "Keep as written".
- Ten drag-overs at the bottom edge scrolled the tree 120 px.
- 10k-file workspace with the 3000-note folder open: tab switches and typing still made no long task.
- Not covered: real WebKit pointer drags (the events were dispatched).

## O4: While typing

### Change
- Done: Outline (`TableOfContentsPanelComponent`, `MinimalLineToc`): rows keyed by position, so typing above a heading no longer remounts every heading below it. `sync()` stores the headings raw (`markRaw`) and runs at most every 100 ms (leading and trailing), the active heading in the same write.
- Done: `WordCounter` counts a copy of the text that settles 250 ms after typing (`refDebounced`).
- Done: `GitDiffView` reloads only when its own file or something under the repository's `.git/` changes, not on every save in the workspace. It keeps the same `sides` object when both texts are unchanged, so `TextDiff` doesn't diff and draw again.
- Dropped: debouncing `WorkflowViewer`'s document watch. A pending write-back is lost when the tab closes: `SessionTab`'s autosave watcher stops before the viewer unmounts. The cost was never measured. If a large workflow shows typing lag, make the write-back flush through the tab's save first.

### Acceptance
- Typing above 300 headings with the Outline open: no long tasks; an open diff tab doesn't re-render while another note is typed in.

### Results (after)
| Scenario | Before | After |
|---|---|---|
| Type 60 characters above 300 headings, Outline open | 60 long tasks, 5.8 s (about 97 ms per key) | 1 long task, 57 ms |
| … with Files open too | 61 long tasks, 6.6 s | 1 long task, 55 ms |
| Switch tabs ×10 between the 300-heading note and another, Outline open | about 120 ms each on top of Files | 1.1 s, 110 ms each: the Outline mounting 300 rows with tooltips (not virtualized) |
| An open 20 000-line diff while 10 other notes save | a reload and full re-diff per save (≈1 s each, as when it opens) | no reload, no long task |
| The diffed file itself, or `.git/`, changes | reload | reload; identical text isn't diffed again |

Checked: the Outline still lists the last headings (Section 298, 299) after typing; the word count goes from 1804 to 1806 after typing pauses.

## O5: Large lists

### Change
- Done: `TextDiff` draws through `UScrollArea virtualize`, one item list per layout (split rows or unified lines). Rows are measured, so wrapped lines work. Find in page reaches only the drawn lines; accepted.
- Done: `BasesViewer`:
  - `UTable` runs with `virtualize` and `watch-options` `{deep: false}`.
  - A link cell finds its file in one map lookup by path suffix (`linksBySuffix`), instead of scanning the list per cell.
  - The global filter reads a 200 ms-debounced copy of the search.
  - The table's option objects are constants. Inline, each render re-rendered the table, and Nuxt UI then re-estimates every row.
  - While loading, the table is `invisible`, not `display: none` (`v-show`). Hidden that way, every row measured 0 px and the "virtual" table drew 5000 of them.
- Done: `VaultPicker`: `UTree virtualize` (the tree is its own `max-h-72` scroller), search debounced 150 ms.
- Done: `FontPicker`: `USelectMenu virtualize` (group labels still show).
- Done: `GitHistoryView`: the selected commit's panel is its own component (`GitCommitDetails`: message, id, parents, files), so scrolling the list no longer redraws its files.
- Dropped: splitting out a `GitBranchPicker`, virtualizing it, and one context menu for the Git list. O0 measured the picker opening in 202 ms with 13 rows (the palette caps its groups) and its search typing without long tasks. Scrolling 500 changes made one task of 65–74 ms.
- Done: Settings → provider page: the inline `:confirm` arrow is hoisted.

### Acceptance
- Opening a 20k-line new-file diff, Bases over 10k notes, the branch picker with 2k branches and the font picker: each without a long task over 100 ms; typing in their searches stays under one frame per keystroke.

### Results (after)
Before and after on the same production build. For Bases, the font picker and History, "before" is the build with only that file reverted.

| Scenario | Before | After |
|---|---|---|
| Open the 20 000-line new-file diff | 1012 ms, 180 701 elements | no long task, 1102 elements; scrolled to line 20 000 without one |
| Open a 2000-line diff with two changes and wrapped lines, open its middle fold | not measured | one 68 ms task; folds, wrapping and the opened run drawn right (screenshot) |
| Open Bases, 10 004 rows × 5 columns | longest 3459 ms (4.3 s), 162 567 elements | longest 168 ms (0.3 s), 2705 elements |
| Type 3 characters in Bases' search | up to 460 ms per key | one 75 ms task |
| Open the font picker, 800 installed fonts | 286 ms, 806 options drawn | 56 ms, 17 drawn |
| Type 8 characters in its search | 7 long tasks, 0.5 s | none |
| Scroll History (20 steps) with a 3000-file commit selected | 21 long tasks, 2.9 s | one 82 ms task |
| Select that commit | 473 ms (its 3000 rows with tooltips) | the same; not virtualized |
| Vault picker on 10 003 files: mount, then search "M" (matches every file) | not measured | 23 rows drawn; one 170–190 ms task each (dev build) |

Checked in the browser:
- The diff's last line reached by scrolling, and the Bases rows, columns and search.
- The font picker's "Proportional" label with the matches.
- History: selecting a commit, clicking its parent, and opening a file's diff.

## O6: Chat

### Change
- Done, the prompt. Cause: `ChatView`'s body is a `createReusableTemplate`, which renders without the compiler's slot flags. Every keystroke re-rendered the body, and `UChatMessages` (its slots never "stable" there) redrew every message. The messages moved to their own component, `ChatThread` (list, actions, edit box, window). Typing re-renders only the prompt now.
- Done: `ChatMarkdown` parses a 100 ms-throttled copy while streaming, and the full text once done.
- Done: tool cards `unmount-on-hide`. Whether a card opens comes from its state (`hasDetail`), so a closed card never serializes its output.
- Done: `ChatMessageBody`, one message's content (notes, text, reasoning, tool calls, questions, approvals, changes). A streamed chunk is a new object for the last message only, so only that body re-renders.
- Done: a long chat mounts its latest 50 messages, with **Show earlier** (50 more each time). The window is a start index (`start`, clamped to keep 50: `from`), only in `ChatThread`. Each edge case as planned:
  - The model gets every message.
  - Replies extend the window.
  - Edit, retry and branch switches keep the message acted on in view.
  - Rewind clamps the window.
  - Show earlier holds the first shown message in place: it adjusts until the earlier messages' markdown has laid out.
  - The context window counts every message.
  - Each view has its own window.
  - `branchesOf` (one pass) replaces `branchOf` (a `findIndex` per message).
- Done, Chats list rows:
  - Each row's "…" menu is its own component (`ChatRowMenu`). It builds its items when opened, and opening it redraws only that menu.
  - Folders are sorted once (`sortedFolders`); there is one date formatter.
  - The drop highlight and the open chat's row (`data-current`, styled in `NAV_UI`) are marked through the DOM, no longer in the items.
  - The menu's `ui` is a constant.
  - Unchanged chats keep their item object.
  - The `@` list and the scope picker sort with one `Intl.Collator`; the scope picker is virtualized.
  - Root cause of the 2 s tab switch: each tab switch rebuilt every row, and each row's menu got new props (items, content). Vue checks the pending pre-flush queue on every component update, so a few thousand updating rows cost about 2 s.
- Dropped: a custom chat state. Streaming into 500 messages now costs two long tasks, 151 ms in total.
- Kept, by decision: the Chats list still redraws on every index save (send, finish, a new title), about 0.44 s with 2000 chats, and only while the list is open. Virtualizing it (a flat list with folder open/close, keyboard navigation, drag & drop and row menus redone) is the fix if it ever matters.

### Acceptance
- Streaming into a 500-message chat: no long task per chunk; opening it under 200 ms; tab switches with 2k chats don't re-render every row.
- In a 120-message chat: the request carries every message; branch arrows, edit, retry, rewind and undo on shown messages behave as before; Show earlier doesn't move what's on screen.

### Results (after)
| Scenario | Before | After |
|---|---|---|
| Type in the prompt, 500 messages, Chats (2000) open | about 1.8 s per key | none |
| … Chats closed | about 250 ms per key | none |
| Open the 500-message chat (from load, with Chats) | 4.7 s, longest 1745 ms | 1.05 s, longest 777 ms (app start included); 50 messages mounted |
| Stream 300 chunks into it | 1.25 s, longest 716 ms; 8.0 s for 6.1 s of chunks | 0.15 s, longest 92 ms; 7.1 s; the request held all 586 model messages |
| Switch tabs ×10 with 2000 chats listed | 19.2 s, about 2 s each | none |
| Scroll the 2000-chat list | not measured | none |
| Stream into a 120-message chat with Chats open | 4.3 s, longest 2141 ms | 0.87 s: two 444 ms tasks, the list redrawing on the save at send and at finish (Chats closed: one 94 ms task) |
| Show earlier (50 more) | | one 144 ms task; the first shown message stays at the same height on screen (144 px before and after) |

Checked in the browser:
- **Messages and the window:**
  - Editing a message inside the window kept it in view, showed 2/2, and sent 539 model messages (the whole branch).
  - The previous-branch arrow brought the original back (1/2).
  - A rewind to Answer 470 ended the list there, still 50 shown.
  - The context dialog on a windowed message said 500 messages.
- **Streaming and tool cards:**
  - The streamed reply ended complete (`word299`).
  - A closed tool card had no body until opened.
- **Chats list:**
  - The open chat's row was in the primary color.
  - A row's menu opened with its six items.
