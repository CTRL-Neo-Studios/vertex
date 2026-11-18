# The package

## What Vertex installs

A folder named by the plugin's id:

| File | |
| --- | --- |
| `plugin.json` | The manifest. |
| `main.js` | One ES module with no imports; its default export is `definePlugin({setup})`. |
| `styles.css` | Optional. Put in the page when the plugin loads, before its code runs. |
| `locales/<locale>.json` | Optional. The plugin's strings. |
| `README.md` | Optional. Shown in the plugin's details in Settings and in the install dialog, as Markdown: no HTML; links open in the browser; images in the plugin's folder draw, others only when the reader asks. Say there what the plugin does, how to use it and what it asks for. |
| anything else | Assets, read through [`ctx.plugin.assetUrl`](context.md#ctxpluginid-ctxpluginversion-ctxpluginsource-ctxpluginasseturl). |

Vertex keeps it in its data folder (`plugins/<id>/`), or in a workspace's `.vertex/plugins/<id>/` for a workspace's
own ([Trust](trust.md#a-workspaces-plugins)), with `.install.json` beside, its record of where it came from.

## `plugin.json`

Unknown keys are errors; the build lists every problem.

| Key | |
| --- | --- |
| `id` | Lowercase letters, digits and inner hyphens, at most 50 characters. The installed folder's name. It names the plugin's strings (`plugins.<id>`), settings (`plugins.config.<id>`), data and secrets, so it's for good. It can't be a core plugin's (`files`, `canvas`, `bases`, `git`, `chat`, `ai`…). |
| `name` | Shown in Settings and in messages ("Hello couldn't start"). Not translated. |
| `version` | Shown, compared for updates, and what a release's tag should be (`0.2.0` or `v0.2.0`). |
| `description` | Optional. One line of at most 160 characters, shown under the plugin's name in Settings and in the install dialog; the build refuses a longer one or a line break. The rest goes in `README.md`. |
| `icon` | Optional. An Iconify name (`i-lucide-hand`) for the plugin's rows and settings page. |
| `author` | Optional, shown. |
| `repository` | Optional. Its Git repository, `https://…`: where it says it lives. Vertex shows it, and records where it actually fetched the plugin from, which it uses for updates ([Publishing](publishing.md)). |
| `apiVersion` | `1`. Vertex refuses a plugin that asks for a newer one ([Versions](versions.md)). |
| `minAppVersion` | Optional. The oldest Vertex it runs in (`0.9.2`); an older one keeps it off. |
| `windows` | Optional. The kinds of window it runs in: `session` (a workspace or a file), `main` (the start page), `settings`. Default `["session"]`. A plugin with a settings page of its own runs in `settings` too. |
| `requires` | Optional. Plugin ids it needs (`["bases"]`); a trailing `?` marks one it uses when it's there (`"chat?"`). Without a required one, it's off and Settings says why. |
| `permissions` | Optional. `network`, `secrets`, `files-outside-workspace` ([what each grants](config.md#permissions)). |
| `enabledByDefault` | Optional. Ignored for a plugin someone installs, which the install turns on. |
| `config` | Optional. Its settings: `schema` (drawn by Settings), `overridable` (what a workspace may change) ([Config](config.md)). |

## The build

`vertex(options)` from `@type32/vertex-plugin/vite`, in `vite.config.ts`:

- builds `options.entry` (default `src/main.ts`) as one `main.js`: everything it imports is bundled, dynamic imports
  included (`main.js` is loaded from memory, where a second file can't be found), and `process.env.NODE_ENV` is
  `production`;
- reads [the modules Vertex shares](#what-the-plugin-shares-with-vertex) from Vertex's own copies;
- runs Tailwind, and writes the plugin's CSS as `styles.css`;
- checks `plugin.json` (its `description` one line of at most 160 characters too) and `locales/*.json`, and copies them
  and `README.md`;
- copies `public/` (Vite's own rule) to the top of `dist/`;
- with `pack: true`, writes `plugin.zip` beside `dist/`, the asset a release carries ([Publishing](publishing.md)).
- with `vite build --watch`, builds again on each change of the source, never of its own output.

Add `@vitejs/plugin-vue` before it to write `.vue` files.

## What the plugin shares with Vertex

Some imports aren't bundled: the build turns them into Vertex's own copies, so there's one Vue, one editor and one
Nuxt UI in a window, and a plugin's `ref` or toast is the app's:

- `vue`;
- `@codemirror/autocomplete`, `commands`, `lang-markdown`, `language`, `language-data`, `lint`, `search`, `state`,
  `view`, and `@lezer/common`, `highlight`, `markdown`;
- `@internationalized/date`, the dates Nuxt UI's date and time inputs take: they tell a date from a date-time with
  `instanceof`, so a date made with a copy of the plugin's own would be neither;
- `@type32/codemirror-rich-obsidian-editor`, `/kit`, `/ext` (Vertex's editor);
- `@nuxt/ui/composables` (`useToast`, `useOverlay`…). Nuxt UI's components are there by name; an import of one's
  file (`@nuxt/ui/components/Button.vue`, as a component library built on Nuxt UI has) is Vertex's component of that
  name. Any other import from `@nuxt/ui` fails the build;
- this package: `@type32/vertex-plugin` (`definePlugin`), `/ui` ([Vertex's components](ui.md#vertexs-components)),
  `/vault`, `/links`, `/files`, `/text` (the helpers below).

Importing a name Vertex's copy doesn't export fails the build. These are the versions this package depends on; a new
major of one is a new `apiVersion`.

The helpers are Vertex's own, the ones its features use:

| Module | |
| --- | --- |
| `@type32/vertex-plugin/vault` | `Vault` (what [`session.files.vault`](session.md#sessionfilesvault) returns), path helpers, tags, patterns, frontmatter written as Obsidian writes it (`setFrontmatterProperty`). |
| `@type32/vertex-plugin/links` | Wiki links in Markdown text: `getInternalLinks`, `rewriteLinks`, `renameTargets` (for a [link extractor](context.md#ctxindexlinkextractor)). |
| `@type32/vertex-plugin/files` | File names and kinds: `fileNameFromPath`, `getFileExtensionFromPath`, `isImage`, `isPlainTextFile`, `IMAGE_TYPES`. |
| `@type32/vertex-plugin/text` | Line diffs: `lineDiff`, `diffCounts` (what `TextDiff` draws). |

## Dependencies

Any other package is bundled into `main.js`: install it and import it (`d3-force`, `yaml`). Keep an eye on the size:
`main.js` is read whole when a window starts the plugin. A part used rarely can be a file in `public/`, loaded with
`import(ctx.plugin.assetUrl('part.js'))` when it's needed; it must be built as a module of its own, with no imports.

A dependency that imports `@vue/reactivity` or `@vue/runtime-core` itself (not `vue`) gets its own copy of them,
which doesn't react with Vertex's.

## Strings

A plugin's strings are files, `locales/<locale>.json`, so Settings can show its labels without running it:

```json
{"plugins": {"hello": {"view": "Hello", "count": "{n} notes"}}}
```

- Everything is under `plugins.<id>`; Vertex reads nothing else from the file.
- `en.json` is required once there are strings. Any other locale has exactly its keys, each with the same `{params}`.
  A language the plugin has no file for shows English.
- Every i18n key `plugin.json` names (its schema's labels, descriptions, info texts and options' labels) must be in
  `en.json`.
- The build checks all of it.

Where the contract says "i18n key" (a view's `label`, a command's, a file type's), give a key of the plugin's,
`plugins.<id>.…`, not text: Vertex translates it where it draws it, in the window's language, and follows a change of
language. Where it says "already translated" (a header button's label, a tab's `describe`), give text, from
[`ctx.i18n.t`](context.md#ctxi18nt-ctxi18nlocale). Vertex's languages are `en` and `zh-CN`.

## What can't be done

- **Native code.** A plugin is JavaScript in Vertex's webview. What it can reach of the computer is what the contract
  offers (files through the session, the network through `ctx.http`, the keychain through `ctx.secrets`).
- **Imports at run time**, besides its own files through `ctx.plugin.assetUrl`: `main.js` has none.
- **A sandbox.** A plugin runs as Vertex does; users are told so ([Trust](trust.md)).
- **Another community plugin's typed API.** `ctx.provide` works for any plugin, but `ctx.use` is typed for Vertex's own
  plugins' APIs only ([`ctx.use`](context.md#ctxprovide-ctxuse-ctxwhenplugin)).
