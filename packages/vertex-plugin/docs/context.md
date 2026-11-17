# The plugin's context

`main.js` default-exports `definePlugin({setup})`. Vertex calls `setup(ctx)` once in each window the plugin runs in
(`plugin.json`'s `windows`), with `ctx: PluginContext`.

```ts
import {definePlugin} from '@type32/vertex-plugin'

interface Config {
    depth: number
}

export default definePlugin<Config>({
    setup(ctx) {
        ctx.commands.register({id: 'hello', label: 'plugins.hello.command', run: () => console.log(ctx.config.value.depth)})
    },
})
```

- **`setup` is synchronous.** What it registers belongs to the plugin and is removed when the plugin stops; an `await`
  would leave that. Do async work inside what it registers (a command's `run`, `onSession`). A `setup` that throws, or
  returns a promise, fails the plugin: it's stopped and the user is told "{name} couldn't start".
- **Every registration returns what removes it.** Rarely needed: everything goes when the plugin stops, and what's
  registered in an `onSession` callback goes with the session.
- **Ids are global.** Panel views and tab kinds are saved in layouts and sessions by id, so start yours with the
  plugin's id (`hello`, `hello-stats`). A command's id is the plugin's own (`<plugin id>:<id>`).
- **Labels are i18n keys** of the plugin's (`plugins.hello.view`) unless the type says "already translated"
  ([strings](package.md#strings)).
- **UI** is a `component` (a lazily loaded Vue component that gets the props) or a `mount(el, props)` that draws into
  `el` and returns what undoes it ([UI](ui.md)). Either draws inside an error boundary that names the plugin.
- `definePlugin<Config>` types [`ctx.config`](config.md#ctxconfig).

## About the plugin and the window

### `ctx.plugin.id`, `ctx.plugin.version`, `ctx.plugin.source`, `ctx.plugin.assetUrl`

Its id and version as its manifest says, and `source`: `global` (installed for every workspace), `workspace` (a
workspace's own) or `core`. `assetUrl(path)` is a URL for a file of the plugin's folder (`logo.svg`, `data/words.json`,
nothing outside it), for an `<img>`, `fetch` or `import()`; the build puts `public/` at the folder's top.

### `ctx.window.kind`, `ctx.window.label`

The window it runs in: `main` (the start page), `session` (a workspace or a single file), `settings`; and the window's
label, unique among the open windows.

### `ctx.i18n.t`, `ctx.i18n.locale`

`t(key, params?)` is a string in the window's language (`t('plugins.hello.count', {n: 3})`), the key itself when
there's none; `locale` is the language (`en`, `zh-CN`). Both are reactive: a template or a `computed` that reads them
follows a change of language.

### `ctx.ui.theme.dark`, `ctx.ui.theme.value`

The window's theme, for what CSS can't reach (a `<canvas>`, a chart library). `dark` is whether it's dark; `value(name)`
reads a CSS custom property as the page resolves it now (`value('--ui-primary')`, `value('--ui-text-muted')`). Both
are reactive: a `watchEffect` that reads them runs again when the user changes light and dark, the colours, or a
workspace's theme. CSS and Tailwind classes follow the theme by themselves ([styles](ui.md#styles)).

## Commands

### `ctx.commands.register`

```ts
ctx.commands.register({
    id: 'open-graph',
    label: 'plugins.hello.openGraph',
    icon: 'i-lucide-waypoints',
    accelerator: 'CmdOrCtrl+Shift+G',
    menu: {section: 'view'},
    palette: true,
    enabled: () => true,
    run: () => {},
})
```

Registered as `<plugin id>:<id>`. `menu` puts it in the menu bar's section (`app`, `file`, `edit`, `view`, `help`),
after Vertex's items; `group` (default 100: the end) places it among Vertex's groups. `accelerator` is the menu item's
shortcut, so it works while the item is in the menu. `palette` lists it in the command palette's Commands. `enabled`
is asked whenever the menu or the palette is drawn.

### `ctx.commands.paletteGroup`

A group of items in the command palette, computed when the palette opens: the open base's commands, each workflow.

```ts
ctx.commands.paletteGroup({
    id: 'hello-recent',
    label: () => ctx.i18n.t('plugins.hello.recent'),
    items: () => [{id: 'a', label: 'A note', icon: 'i-lucide-file', onSelect: () => {}}],
    order: 40,
})
```

`label()` and the items' labels are already translated. Groups sort by `order`: Vertex's Quick actions are 0,
Commands 10, Files 100; default 50.

## Views

### `ctx.views.panel`

A view in a sidebar or the bottom panel.

```ts
ctx.views.panel({
    id: 'hello',
    label: 'plugins.hello.view',
    icon: 'i-lucide-hand',
    defaultArea: 'right',
    tab: true,
    component: () => import('./View.vue'),
})
```

The component gets `PanelViewProps`: `session` (the window's [session](session.md)), `placement` (`panel`, or `tab`
when it's open in a tab) and `actions(list)`, which sets the buttons in the panel's header (refresh, collapse all):

```ts
props.actions([{id: 'refresh', label: ctx.i18n.t('plugins.hello.refresh'), icon: 'i-lucide-refresh-cw', onSelect: () => {}}])
```

- `defaultArea`: where it first goes (`left`, `right`, `bottom`, `hidden`) while the user's layout doesn't place it.
  The user moves it from there.
- `tab: true`: it may also open in a tab ([`session.views.openInTab`](session.md#sessionviewsshow-sessionviewsopenintab)),
  so it must work mounted twice at once.
- `when(context)`: whether it can show in this window (`context.isWorkspace`, `context.activeFile`, `context.settings`).
- `scroll: true` wraps it in the panel's fading scroll area, for a view that doesn't scroll by itself.
- `search(context)`: what the panel's Search button does while it's shown; `kbds(context)`: a shortcut hint.
- `action(context)` instead of a component: the view is a button that runs it (Search is one).

### `ctx.views.tabKind`

A kind of tab that isn't a file's (a chat, a diff). Its tabs are opened with
[`session.tabs.open(id, kind)`](session.md#sessiontabsopen-sessiontabsclose-sessiontabsactive-sessiontabslist).

```ts
ctx.views.tabKind({
    kind: 'hello-report',
    describe: id => ({label: ctx.i18n.t('plugins.hello.report', {id}), icon: 'i-lucide-file-chart-column'}),
    persist: true,
    exists: id => id !== '',
    component: () => import('./Report.vue'),
})
```

The component gets `TabProps`: `session` and `id`, the tab's id within the kind. `describe(id)` names the tab in the
tab bar (already translated), `undefined` when what it shows is gone. `persist` reopens it after a relaunch, once
`exists(id)` says it still has something to show.

### `ctx.views.fileViewer`

What a tab of a file draws, for the extensions it matches.

```ts
ctx.views.fileViewer({
    id: 'board',
    match: ext => ext === 'board',
    loadsText: true,
    component: () => import('./BoardViewer.vue'),
})
```

The component gets `ViewerProps`. With `loadsText`, the tab reads the file as UTF-8 into `modelValue`, and a
`v-model` update autosaves it (undo, the unsaved dot and reloads on an outside change are the tab's). Without it, the
viewer reads the file itself, from `assetUrl` or through the session. `fileName` (`v-model:fileName`) is the editable
title; draw the header, title and status bar with `ViewerLayout` ([UI](ui.md#vertexs-components)), passing its
`on-rename` to `onRename`. `modes` limits it to `workspace` or `singlespace` windows; the highest `priority` wins when
several viewers match (default 0; Vertex's code editor, the fallback, is -100).

### `ctx.views.statusItem`

Something a viewer shows besides its content: in its status bar (a counter), or over its right edge (`placement:
'side'`).

```ts
ctx.views.statusItem({
    id: 'hello-chars',
    viewers: ['markdown'],
    mount(el, props) {
        el.textContent = `${props.text.length}`
        return () => el.replaceChildren()
    },
})
```

It gets `StatusItemProps`: the shown file's `text`, `filePath`, `fileId` and `session`. `viewers` lists the viewers it
shows for (Vertex's note editor is `markdown`); default every viewer that loads text.

### `ctx.views.overlay`

UI drawn once in each session window, over everything (the command palette is one). It gets `{session}`; `when`
limits it to some windows.

## Files

### `ctx.files.type`

A kind of file: its icon in Files, and with `new`, a New item in File → New, Files' menus and the palette.

```ts
ctx.files.type({
    id: 'board',
    extensions: ['board'],
    icon: 'i-lucide-square-kanban',
    label: 'plugins.board.fileType',
    new: {label: 'plugins.board.new', command: 'plugins.board.newCommand', description: 'plugins.board.newDescription'},
})
```

New asks for a name and makes an empty file, so the file's viewer reads empty text as a new one. Pair it with a
[viewer](#ctxviewsfileviewer) and, when the format holds links, a [link extractor](#ctxindexlinkextractor).

### `ctx.files.menuItem`

A group of items in the right-click menu of a file or a selection, at the top.

```ts
ctx.files.menuItem({
    id: 'hello-count',
    items: ({files}) => [{label: ctx.i18n.t('plugins.hello.count', {n: files.length}), icon: 'i-lucide-hash', onSelect: () => {}}],
})
```

## Settings and the start page

### `ctx.settings.page`

A page of the Settings window, at `/settings/<id>`, in the nav under the plugin. The plugin must run in the Settings
window (`"windows": ["session", "settings"]`). A plugin with only a schema doesn't need one: Settings draws it from
the manifest ([Config](config.md#the-schema)).

```ts
ctx.settings.page({
    id: 'hello',
    label: 'plugins.hello.settings',
    component: () => import('./SettingsPage.vue'),
})
```

The component gets `SettingsPageProps`: `path` (the route below the page: `/settings/hello/a/b` → `['a', 'b']`) and
`config` (`ScopedConfig`: the plugin's config in the scope Settings is editing, the user's or a workspace's). Draw it
with `SettingsScrollLayout`, `SettingsSection` and `SettingsRow` ([UI](ui.md#vertexs-components)) so it looks and
behaves like Vertex's pages. `children` adds sub-entries to the nav (`{label, icon, path}`); `icon` defaults to the
manifest's.

### `ctx.settings.open`

Opens the Settings window (or brings it forward) at `/settings/<path>`, on the calling window's scope.

### `ctx.home.action`

A button on the start page, after New Workspace (Clone Workspace… is one). The plugin must run in the main window
(`"windows": ["main"]`). `run(home)` gets `home.openWorkspace(path)`.

## The editor

What's added to the note editor, Vertex's Markdown editor (CodeMirror 6, `@type32/codemirror-rich-obsidian-editor`).

### `ctx.editor.extension`

A CodeMirror extension, in every note editor. `{nested: true}` puts it also in the editors inside callouts, table
cells and canvas cards.

```ts
import {EditorView} from '@codemirror/view'

const theme = EditorView.theme({'.cm-line': {letterSpacing: '0.01em'}})
ctx.editor.extension(theme, {nested: true})
```

A function `(host) => extension` gets each editor's `EditorHost` (`session`, `notePath`). What it returns must be the
same objects on every call (module constants; options through a facet), or CodeMirror remounts them.

### `ctx.editor.codeBlock`

A fenced code block drawn as a widget, in notes, callouts, table cells and canvas cards.

````ts
ctx.editor.codeBlock({
    language: 'statblock',
    mount(el, {codeContent, host}) {
        el.textContent = `${host.notePath}: ${codeContent.length} characters`
        return () => el.replaceChildren()
    },
})
````

It gets `codeContent` (the fence's text) and `host`.

### `ctx.editor.embed`

How `![[file]]` draws the files it matches, in notes and canvas cards.

```ts
ctx.editor.embed({
    id: 'board',
    match: ext => ext === 'board',
    linkName: 'name',
    component: () => import('./BoardEmbed.vue'),
})
```

It gets `EmbedProps`: `filePath` (workspace-relative), `subpath` (after `#`), `display` (after `|`), `assetUrl`,
`host`, and `card: true` in a canvas card, where it fills the box.

### `ctx.editor.markdown`

Syntax the editor's parser reads, in notes and everything nested in them: a Lezer `MarkdownConfig`
(`@lezer/markdown`).

```ts
import type {MarkdownConfig} from '@lezer/markdown'

const roll: MarkdownConfig = {
    defineNodes: [{name: 'DiceRoll'}],
    parseInline: [{
        name: 'DiceRoll',
        parse(cx, next, pos) {
            if (next !== 123 /* { */) return -1
            const end = /^\{\d*d\d+(?:[+-]\d+)?\}/.exec(cx.slice(pos, cx.end))?.[0].length
            return end ? cx.addElement(cx.elt('DiceRoll', pos, pos + end)) : -1
        },
    }],
}
ctx.editor.markdown(roll)
```

Parsing gives the syntax a node; drawing it (a decoration, a widget) is an [extension](#ctxeditorextension)'s job,
which finds the nodes with `syntaxTree(state)` (`@codemirror/language`).

### `ctx.editor.slashItem`, `ctx.editor.toolbarItem`

An item in the slash menu (`/` in a note), or in the toolbar over a selection: the editor's `EditorAction`.

```ts
ctx.editor.slashItem({
    id: 'hello-statblock',
    label: 'plugins.hello.statblock',
    icon: 'i-lucide-swords',
    keywords: ['creature', 'monster'],
    run: view => {
        const at = view.state.selection.main.head
        view.dispatch({changes: {from: at, insert: '```statblock\nname: Goblin\n```\n'}})
    },
})
```

### `ctx.editor.noteMenuItem`

A group of items in a note's right-click menu, after Cut, Copy, Paste and Select all. `items({host, selection})` gets
the selected text; an item's `onSelect` runs once the menu has closed.

## The index

### `ctx.index.linkExtractor`

The links in a file format that isn't Markdown, so its files count in backlinks and the graph, and renames update
them.

```ts
import {getInternalLinks, rewriteLinks} from '@type32/vertex-plugin/links'

ctx.index.linkExtractor({
    id: 'board',
    match: ext => ext === 'board',
    targets: text => getInternalLinks(text).map(link => link.path),
    rewrite: (text, rename) => rewriteLinks(text, rename),
})
```

`targets(text)` returns the link targets as written (`target` of `[[target]]`). `rewrite(text, rename)` returns the
text with each renamed target replaced (`rename`: old target → new) and how many changed; without it, links in these
files aren't updated on a rename. For a format that holds Markdown inside JSON, read and rewrite the Markdown parts.

## Sessions

### `ctx.onSession`

```ts
ctx.onSession(session => {
    session.index.on(event => console.log(event.type))
})
```

Runs in a session window once its workspace's index is built (at once, if it already is), with the
[session](session.md). What it registers and listens to ends with the session. Views, viewers and the rest get the
session as a prop; `onSession` is for work that isn't drawn (an index listener, a palette group of the workspace's).

## Other plugins

### `ctx.provide`, `ctx.use`, `ctx.whenPlugin`

`provide(api)` offers an object to other plugins. `use(id)` is a running plugin's API, `undefined` when it isn't
running in this window; `whenPlugin(id, fn)` runs `fn` with it now or once that plugin starts.

```ts
ctx.whenPlugin('bases', bases => {
    bases.registerView({type: 'calendar', label: 'plugins.hello.calendar', icon: 'i-lucide-calendar', component: () => import('./Calendar.vue')})
})
```

Put the plugin you use in `requires` (`"requires": ["bases"]`, or `"bases?"` when it's optional). The SDK types the
APIs of Vertex's own plugins: `bases` (`registerView`, `Value`), `ai`, `chat`, `mermaid` (`Diagram`), `workflows`
(`run`, `dryRun`, `registerNodes`). A community plugin's API can be provided and used at run time, but it can't be
typed yet.

## Dialogs

### `ctx.dialogs.open`, `ctx.dialogs.save`

The system's Open and Save dialogs: an absolute path, `null` when cancelled. What's picked is this window's to read
(open) or write (save), even outside the workspace.

```ts
const path = await ctx.dialogs.open({title: 'Import', filters: [{name: 'CSV', extensions: ['csv']}]})
```

`directory: true` picks a folder. Files inside the workspace are the session's ([session](session.md#files)).
