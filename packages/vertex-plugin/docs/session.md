# The session

A session window shows a workspace (a folder) or a single file. Its `SessionContext` is what a plugin works with
there: the workspace's index and files, the tabs, the editors. Views, viewers, tabs, status items and overlays get it
as their `session` prop; [`ctx.onSession`](context.md#ctxonsession) gets it for work that isn't drawn.

Files are named three ways: by **uuid** (the index's id for a file, stable across renames while Vertex runs, also its
tab's id), by **absolute path**, and by **workspace-relative path** (`notes/a.md`; `''` is the top level). Each member
says which it takes. In a single-file window the index is empty.

### `session.session`

The window's session (`ActiveSession`): its `uuid`, whether it's a workspace's (`workspaceSession`), and the
workspace's `rootPath`.

## Views

### `session.views.show`, `session.views.openInTab`

`show(id)` shows a panel view in its pane (out of Hidden, its area expanded), `false` when no pane can show it.
`openInTab(id)` opens a view registered with `tab: true` in a tab.

## The index

The workspace's files and links, kept up to date as files change, by Vertex or outside it. Reactive: a `computed`
that reads it follows.

### `session.index.files`, `session.index.byPath`, `session.index.byUuid`

Every file and folder (`ActiveWorkspaceFileIndex`: `uuid`, `fullPath`, `relativePath`, `fileName`, `fileExt`,
`isFolder`, `size`, `properties` (a note's frontmatter), `forelinks`, `backlinks` (uuids), `meta` (a note's tags, link
texts, embeds), `createdTime`, `modifiedTime`), and one by absolute path or uuid.

### `session.index.tree`

Folders and files as Files shows them: the top level, each folder's `children`, sorted.

### `session.index.resolveLink`

The file a link target finds (`resolveLink('Some note')` for `[[Some note]]`), as the editor resolves it.

### `session.index.backlinks`, `session.index.forelinks`, `session.index.links`, `session.index.unresolved`

A file's backlinks and forelinks (uuids), every resolved link as `{from, to}` uuids (a graph's edges), and a file's
link targets that find no file.

### `session.index.on`

```ts
const off = session.index.on(event => {
    if (event.type === 'rename') console.log(event.oldPath, '→', event.newPath)
})
```

Files created (`create`), removed (`remove`, with every entry removed), renamed (`rename`), modified (`modify`), by
absolute path. Returns what stops listening; it stops with the session anyway.

### `session.index.search`

```ts
const {hits, more} = await session.index.search('todo', {folder: 'projects', context: 1, limit: 50})
```

Notes (Markdown and text files) whose path or text matches, in path order, read from disk: each hit a workspace-relative
`path`, and for a line, its `line` and `snippet`. Plain text and case-insensitive unless `regex` or `caseSensitive`;
dot folders are skipped.

## Commands

### `session.commands.list`, `session.commands.paletteGroups`

Every registered command (with its plugin), and the palette's groups: what a command palette of one's own lists.

## Files

What Files does, for a plugin: notes written through the index, files created, moved, copied and deleted with Files'
undo, dialogs and toasts. What a file browser needs is all here (menus, New, drags, drops, the clipboard).

### `session.files.assetUrl`

A URL the webview can load an absolute path from (images, media).

### `session.files.write`

Writes a file's text, by uuid, and updates the index: a plugin's save.

### `session.files.create`

Creates an empty file `name` in a workspace-relative folder (made when missing) and indexes it; throws when the path
exists.

### `session.files.edit`

New text for notes (`[{uuid, text}]`) as one step of Files' undo history named `label`; open tabs of them reload.

### `session.files.move`, `session.files.relocate`, `session.files.duplicate`

`move(uuids, folder)` moves files into a folder, with Files' prompts when a name is taken, and undo. `relocate(items)`
moves and renames items to workspace-relative paths (`{uuid, to}`), and `duplicate(items)` copies them: one undo step
each, links to moved files updated as the user's setting says, nothing replaced (what can't go comes back in
`skipped` with why).

### `session.files.undo`, `session.files.redo`

Files' undo history: the last file operation undone, or redone.

### `session.files.remove`

Deletes files by uuid into the trash, with Undo; asks first when the user's deletes are for good.

### `session.files.copy`, `session.files.paste`

`copy(uuids)` puts files on the system clipboard as files (Finder and Explorer paste them). `paste(folder)` copies the
clipboard's files into a folder; their new uuids.

### `session.files.importAttachments`, `session.files.importDrop`, `session.files.outside`

Files from outside. `importAttachments(files)`: `File`s as workspace uuids, the workspace's own as they are, the rest
copied into the attachments folder. `importDrop(transfer, folder)`: a drop's OS files copied into a folder (moved when
they're the workspace's own; `{copy: true}` copies anyway); call it inside the `drop` event. `outside(source)` (a
drop, `'clipboard'`, or `File`s) describes them first (`own`, `items`, `folder`) and copies only what `import(chosen)`
is given, to ask the user before.

### `session.files.pick`

Vertex's picker of the workspace's files or folders: workspace-relative paths, `undefined` when it's closed.

```ts
const paths = await session.files.pick({title: 'Choose notes', kind: 'file', multiple: true, extensions: 'md'})
```

### `session.files.vault`

The workspace as a `Vault` (`@type32/vertex-plugin/vault`), over workspace-relative paths: `entries`, `entry`,
`linksTo`, `linksFrom`, `read`, `write`, `create`, `createFolder`, `move`; what it writes goes through the index as
Vertex's own edits do. The same module writes frontmatter as Obsidian does (`setFrontmatterProperty`). Throws in a
single-file window.

### `session.files.iconFor`

The icon of a file name: its [file type's](context.md#ctxfilestype), or `undefined` for one Vertex draws itself.

### `session.files.openFolders`

The folders a file browser shows open (uuids), a `Ref` saved and restored with the session.

### `session.files.menuFor`, `session.files.newItems`

`menuFor(uuids, {added})` is Files' right-click menu for rows (one, a selection, or `[]` for the empty space), as
groups of `PluginMenuItem`s for a `UContextMenu`; plugins' items come first, and `added` gets the uuids Paste and
Duplicate made. `newItems(folder)` is New note, New folder and each file type's New, each asking for a name.

### `session.files.drag.start`, `session.files.drag.rows`, `session.files.drag.carries`

`start(event, uuids, grab, ended)` inside a `dragstart` makes it Files' drag: its drag image, what the editor and chat
accept, and in Vertex a drag Finder and Explorer copy from; `ended` runs when it's over. `rows(transfer)` is the
workspace-relative paths of rows dragged from Files (a folder's ends with `/`), `undefined` for another drag;
`carries(transfer)` whether a drag carries files at all.

### `session.files.openWithDefaultApp`, `session.files.reveal`

Opens a file in the app the system gives its kind; shows files in Finder or Explorer.

## Properties

### `session.properties.types`, `session.properties.setType`

The vault's property types (Obsidian's `types.json`: key → `text`, `multitext`, `number`, `checkbox`, `date`,
`datetime`…), reactive; `setType(key, type)` sets one, `null` back to Automatic.

## Tabs

### `session.tabs.open`, `session.tabs.close`, `session.tabs.active`, `session.tabs.list`

`open(uuid)` opens a file in a tab and shows it; `open(id, kind)` a tab of a [kind](context.md#ctxviewstabkind).
`active()` is the shown tab's id; `list()` every tab's `{kind, id}` (no `kind` for a file's).

## Editors

### `session.editor.viewOf`

The CodeMirror `EditorView` of a note's tab while it's shown (by the tab's id, the file's uuid), to read the cursor or
dispatch a change.

### `session.editor.content`

A text tab's buffer as it is now, saved or not.

### `session.editor.lastShownNote`

The note tab shown last: where an action from elsewhere (a chat) should go.

### `session.editor.embedFor`

The embed registered for an extension: draw another plugin's `![[file]]` with `PluginMount` ([UI](ui.md)).

## Outside the index

### `session.watch`

```ts
session.watch('.hello', paths => console.log(paths))
```

Changes under a workspace-relative folder the index ignores (a dot folder), as absolute paths, a batch at a time.
