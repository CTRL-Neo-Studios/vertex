# Manual smoke checklist

Run in `bun tauri:dev` after every refactor phase. Flows marked **known broken** are
expected to fail until the noted phase lands; anything else failing is a regression.

| # | Flow | Expected | Status |
|---|------|----------|--------|
| 1 | Open a folder, open 3 tabs, close the window (red button), relaunch | Same 3 tabs restored | known broken until P3 (close saves empty tab list) |
| 2 | Open 2 workspaces with tabs, Cmd+Q, relaunch | Both workspaces and tabs restored | known broken until P3 (500 ms quit timeout) |
| 3 | Open 2 workspaces; open a tab in A, then close B | A's tab survives relaunch | known broken until P3 (sessions.json lost update) |
| 4 | Open a single `.md` file, quit, relaunch | Restored per the recovery setting | known broken until P3 (singlespace never recovered) |
| 5 | Select 2 `.md` files in Finder → Open With Vertex | Both open | known broken until P3 (single startup slot) |
| 6 | With Vertex running, open a `.md` from Finder | It opens | flaky until P3 |
| 7 | Cmd+S, Save As, Cmd+Shift+N, Vertex → About | Each does something | known broken until P6 (no listeners) |
| 8 | Change theme in Settings, then click an editor window | Editor shows the new theme | known broken until P3 |
| 9 | In a workspace, edit a note in another editor | Backlinks/frontmatter update in Vertex | known broken until P4 (watcher drops content events) |
| 10 | Rename a note that other notes link to | Backlinks to it are kept (or you're asked to update links) | known broken until P4 |
| 11 | Create, rename, delete a file and a folder from the file tree | Tree and tabs update; no console errors | should pass |
| 12 | Type in a note, wait 1 s, reopen it | Content persisted | should pass |
| 13 | New file named `.hidden` | Allowed | fixed in P0 |
| 14 | Open Settings, toggle each view option, close | Persists across relaunch | should pass |
