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
| 7 | Cmd+S, Save As, Cmd+Shift+N, Vertex → About | Each does something | fixed in P6 (command registry; items enable per window); typed autosave + Close Tab verified live in P6 |
| 8 | Change theme in Settings, then click an editor window | Editor shows the new theme | fixed in P3 (settings broadcast); not separately exercised |
| 9 | In a workspace, edit a note in another editor | Backlinks/frontmatter update; open tab reloads if it has no unsaved edits | fixed in P4 (watcher handles content events; covered by `workspaceFlow.test.ts`); live check pending |
| 10 | Rename a note that other notes link to | "Update N links?" prompt; accepting rewrites `[[old]]`, declining keeps links (unresolved, not dropped) | verified in P6 (breadcrumb rename → prompt "2 links in 1 note" → `[[Bee]]`, `[[notes/Bee\|alias]]`, frontmatter kept) |
| 16 | Clear a note completely, wait 1 s, reopen | Stays empty | fixed in P4 (empty content was never written) |
| 11 | Create, rename, delete a file and a folder from the file tree | Tree and tabs update; no console errors | should pass |
| 12 | Type in a note, wait 1 s, reopen it | Content persisted | should pass |
| 13 | New file named `.hidden` | Allowed | fixed in P0 |
| 14 | Open Settings, toggle each view option, close | Persists across relaunch | should pass |
| 15 | Close the last session window | Main window reappears | verified in P3 |
| 17 | Settings → General → Language = 简体中文 | Menu and UI switch to Chinese in every window | verified in P6 |
| 18 | Window narrower than `lg` (1024 px) | Nuxt UI dashboard collapses to a single panel with the sidebar as a drawer | known; upstream `UDashboardSidebar` behaviour, not changed |