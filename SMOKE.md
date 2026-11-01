# Manual smoke checklist

Run in `bun tauri:dev` after every refactor phase. Flows marked **known broken** are
expected to fail until the noted phase lands; anything else failing is a regression.

| # | Flow | Expected | Status |
|---|------|----------|--------|
| 1 | Open a folder, open 3 tabs, close the window (red button), relaunch | Same tabs restored (with recovery set to include workspaces) | fixed in P3 — verified in `tauri dev` (close button → tabs/folders/focus kept) |
| 2 | Open 2 workspaces with tabs, Cmd+Q, relaunch | Both workspaces and tabs restored | fixed in P3 — verified (quit with 2 session windows open: exits in <0.5 s, state kept) |
| 3 | Open 2 workspaces; open a tab in A, then close B | A's tab survives relaunch | fixed in P3 (Rust single writer); not separately exercised |
| 4 | Open a single `.md` file, quit, relaunch | Restored per Settings → General → Reopen windows on launch | fixed in P3 — verified with `both` (workspace + singlespace reopened) |
| 5 | Select 2 `.md` files in Finder → Open With Vertex | Both open | fixed in P3 (queue keeps every path; unit-tested); live check pending |
| 6 | With Vertex running, open a `.md` from Finder | It opens | fixed in P3 (queued, drained on event and at startup); live check pending |
| 7 | Cmd+S, Cmd+Shift+N, Vertex → About | Each does something | fixed in P6 (command registry; items enable per window); typed autosave + Close Tab verified live in P6. Save As removed in P7 (it only served an unreachable "Untitled" buffer) |
| 8 | Change theme in Settings, then click an editor window | Editor shows the new theme | fixed in P3 (settings broadcast); not separately exercised |
| 9 | In a workspace, edit a note in another editor | Backlinks/frontmatter update; open tab reloads if it has no unsaved edits | fixed in P4 (watcher handles content events; covered by `workspaceFlow.test.ts`); live check pending |
| 10 | Rename a note that other notes link to | "Update N links?" prompt; accepting rewrites `[[old]]` and the open tab of the linking note shows it at once; declining keeps links (unresolved, not dropped) | verified in P6 (breadcrumb) and P7 (tree Rename → `[[Bee]]` → `[[Bea]]`, open tab refreshed) |
| 16 | Clear a note completely, wait 1 s, reopen | Stays empty | fixed in P4 (empty content was never written) |
| 11 | Create, rename, delete a file and a folder from the file tree | Tree and tabs update; "Above level" creates next to the parent folder | P7: create (Above level → vault root) and rename verified live; delete/folder not exercised |
| 12 | Type in a note, wait 1 s, reopen it | Content persisted | should pass |
| 13 | New file named `.hidden` | Allowed | fixed in P0 |
| 14 | Open Settings, toggle each view option, close | Persists across relaunch | should pass |
| 15 | Close the last session window | Main window reappears | verified in P3 |
| 17 | Settings → General → Language = 简体中文 | Menu and UI switch to Chinese in every window | verified in P6 |
| 18 | Window narrower than `lg` (1024 px) | Nuxt UI dashboard collapses to a single panel with the sidebar as a drawer | known; upstream `UDashboardSidebar` behaviour, not changed |
| 19 | Single-file window: another program edits the file; a sibling file in the same folder is deleted | Tab reloads; window stays open | verified in P7 (merged index) |
| 20 | Single-file window: type, wait 1 s | Written to disk | verified in P7 |
| 21 | Settings → Theme: pick a primary, a neutral, radius 0 | Applies at once; other fields keep their values; per-section reset appears | verified (Red/Mauve/Emerald; radius 0 now sticks; reset restores stock) |
| 22 | Settings → Theme → Appearance = Dark, look at another window | Every window switches | verified (was per-window before; now in settings) |
| 23 | Settings → Theme → Editor font: search an installed family | Listed from the system, renders in its own face, applies to the preview | verified (Georgia) |
| 24 | Settings → View: toggle a switch, then the section reset | Saved with the rest of `viewConfig` intact; reset restores defaults | verified |
| 25 | Workspace: file tree → New Workflow → This Level; add On Run, Notes Tagged (tag `draft`), For Each, Rename etc. | Canvas edits autosave to the `.workflow` file as JSON; reopening shows the same graph | verified in a web build with Tauri IPC answered over a real folder (M6); live check pending |
| 26 | In a `.workflow` tab: Dry run, then Run on a never-run workflow | Dry run lists renames/link/property changes and touches nothing; Run first asks to trust (capabilities + same diff), then changes the files; tree and backlinks follow; a second Run doesn't ask | verified as in #25; live check pending |
| 27 | After a run: Undo run | Every file back byte for byte; a file edited since the run is skipped and named | byte-for-byte restore verified as in #25; the skip path is unit-tested only; live check pending |
| 28 | Run a workflow with a Trash node; Settings → Workflows → Revoke | Asks once before trashing; files land in `<vault>/.vertex/trash/<run>/` and leave the tree; Undo brings them back; revoked workflows ask again | verified as in #25 up to Revoke removing the record; asking again after revoke not exercised; live check pending |