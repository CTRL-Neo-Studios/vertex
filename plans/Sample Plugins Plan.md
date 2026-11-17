# Sample Plugins Plan

Was C4 of the Plugin Architecture Plan (`plans/Plugin Architecture Plan.md`), planned apart on 17 Nov: it is six
plugins, the author docs and whatever the contract turns out to lack, too much for one phase. Blocked by C3.

Six community plugins, each written as an outside author would write one, and the docs that author reads. They prove
the contract: a sample that needs the kernel's source to get written has found a gap, and the gap is closed in the
contract before the sample goes on. Each sample is a repository of its own beside Vertex, installed the way a user
installs any plugin (C2b), so Vertex's repository holds none of their code.

Each phase ends reviewable on its own: Vertex with `typecheck`, the tests and lint clean, the sample's repository
building and released.

## Baseline (17 Nov, after C3)

- **Vertex:** 423 tests (50 files); 62 Rust tests; typecheck with the 7 errors in `@type32/latex2vue`.
- **SDK:** `packages/vertex-plugin`, `@type32/vertex-plugin` `1.0.0-alpha.0`, `private`, not published. Its only user
  outside Vertex is the test plugin (`../text-vertex-plugin`, `Type-32/test-vertex-plugin`), which takes it as
  `file:../vertex/packages/vertex-plugin` and builds its releases on this machine.
- **The contract** (`shared/plugin/api.ts`, `contributions.ts`): every contribution point the six samples name exists
  (`views.panel` with `tab`, `views.fileViewer`, `files.type`, `index.linkExtractor`, `editor.codeBlock`, `markdown`
  and `slashItem`, `settings.page`, `config` with scopes, `secrets`, `data`, `session.index` and `session.files`, and
  Bases' `registerView`). What a community plugin lacks is listed under Gaps.

## Decisions

| Question | Decision |
| --- | --- |
| Where a sample lives | Its own folder beside Vertex and its own public repository under `Type-32`, as the test plugin (the user's choice, 17 Nov). Vertex's repository, tests and build know none of them. |
| How Vertex gets one | As a user does: Settings → Plugins → Install…, from the repository's release (`plugin.zip`). Checked globally and in a workspace. |
| What a sample may import | The SDK's modules and what it bundles itself. The SDK's build already fails on any other import of the app's. |
| What a sample's author may read | The author docs and the SDK's published types. Not Vertex's source (Open questions, 3). |
| A gap | The sample stops. The gap gets a row under Gaps, is closed in Vertex (contract, a test, the docs), and Vertex is committed before the sample goes on. Nothing reaches into the kernel's internals to get by. |
| Contract changes | Additions only, within `apiVersion` 1 while the SDK is an alpha. A sample sets `minAppVersion` to the Vertex that has what it uses. |
| Author docs | In the SDK's package (`packages/vertex-plugin/docs/`, shipped with it), since they version with the contract and reach an author with the types. `Concepts and Structures.md` links them. |
| Each repository's checks | `bun run build`, `bun run typecheck`, and one `bun test` file for logic that isn't drawing (the graph's data, the board's parser, the calendar's grid). |
| Order | The graph first, alone: it is the plan's first user of the docs and finds the gaps the others share. Then the small ones, each on a different part of the contract. The file browser last: the widest surface. |
| The test plugin | Stays the fixture for install and update tests. It isn't a sample. |
| A plugin's strings (P0) | Files, `locales/<locale>.json` in the package, each `{"plugins": {"<id>": {…}}}` as a core layer's are. Not in the bundle, as first proposed: the Settings window shows a plugin's schema labels without running it (it runs the global plugins made for `settings` only), so the strings must be readable without its code. The host merges only `plugins.<id>`; a workspace copy's strings are pinned with it. |
| The SDK (P0) | Published by the user on 17 Nov: `@type32/vertex-plugin` `1.0.0` on `latest`, released with `bun run release` in the package. P0's additions to the contract are a minor version. |
| The template (P0) | `Type-32/vertex-plugin-template`, a GitHub template repository beside Vertex (`../vertex-plugin-template`), the samples' and the docs' starting point. |

Still open (Open questions): who writes the samples (3), the new file format (5).

```mermaid
flowchart LR
  P0 --> D1 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> D2
```

## Repositories

| Phase | Folder beside Vertex | Repository | Plugin `id` | Exercises |
| --- | --- | --- | --- | --- |
| S1 | `vertex-plugin-graph` | `Type-32/vertex-plugin-graph` | `graph` | panel views in a pane and a tab, commands, the index and its events, the theme, config with workspace overrides, bundled dependencies |
| S2 | `vertex-plugin-settings-sample` | `Type-32/vertex-plugin-settings-sample` | `settings-sample` | schema settings, a settings page of its own, an overridable key, a secret, a permission |
| S3 | `vertex-plugin-stat-block` | `Type-32/vertex-plugin-stat-block` | `stat-block` | a code block widget, a slash item, Markdown syntax, the editor's nested contexts |
| S4 | `vertex-plugin-board` | `Type-32/vertex-plugin-board` | `board` | a file type with New, a viewer that loads text, a link extractor |
| S5 | `vertex-plugin-bases-calendar` | `Type-32/vertex-plugin-bases-calendar` | `bases-calendar` | `requires`, a core plugin's API (`ctx.use('bases')`) |
| S6 | `vertex-plugin-navigator` | `Type-32/vertex-plugin-navigator` | `navigator` | `session.files` whole (menus, New, drags, undo), `data.workspace`, assets |

None of the ids is a core plugin's (`ai`, `ai-assistant`, `backlinks`, `bases`, `bases-map`, `canvas`, `chat`,
`files`, `git`, `image`, `latex`, `mermaid`, `outgoing-links`, `outline`, `palette`, `workflows`, `writers-tools`,
`yaml-form`).

## Gaps

Found by reading the contract, before any sample is written. P0 closes the first five; each sample adds its own rows.

| What's missing | Who needs it | Today |
| --- | --- | --- |
| A plugin's own strings | all | Closed in P0: `locales/`, `ctx.i18n`. |
| The theme | the graph (it draws on a canvas) | Closed in P0: `ctx.ui.theme`. |
| Icons | all | Closed in P0: the installed icon sets load offline. |
| `/ui`'s components' props | S2, S6 | Closed in P0: `shared/plugin/components.ts`. |
| The SDK outside this machine | all | Closed: published (Decisions). |
| A worker | the graph, maybe | A plugin is one `main.js` imported from a blob URL. Whether a `Worker` can start from a plugin's asset isn't known; only needed if 5,000 notes don't lay out on the main thread (S1 measures first). |

## P0: What every sample needs

In Vertex. Nothing here is a sample's.

### Change
- **Strings:** a plugin's `locales/<locale>.json`, checked when it's built and merged where it's listed; `ctx.i18n`
  (`t`, `locale`) for what it draws itself. The manifest's keys are checked against `en` when the plugin is built.
- **The theme:** `ctx.ui.theme`, reactive: `dark`, and `value(property)` for any of the page's CSS custom properties
  as resolved now (the colours a canvas needs and anything else), following whatever sets them.
- **Icons:** check a Lucide icon outside the app's bundle. If it doesn't draw offline, the fix is the kernel's (the
  whole Lucide set available offline), not a list per plugin.
- **`/ui` types:** each published component with its props, from the build that writes `ui.d.ts`.
- **The SDK:** published.
- **A template:** the files every sample starts from.
- The test plugin moves to its own strings, so the dev log's `intlify` warnings stop.

### Acceptance
- [x] A plugin outside Vertex shows its view label, a command and a schema field in en and zh-CN, and follows a language change without a reload. (In `tauri dev`, separate app identifier, a temporary harness and a scratch plugin built with the SDK's preset, all deleted after. Its panel's tab read "P0 check" and, after the language setting changed to zh-CN, "P0 检查", the test plugin's "Test plugin" and "测试插件", its text "Hello V" and "你好 V", with no reload; its schema page in the Settings window, where the plugin doesn't run, read "Depth · How far to look". A command wasn't tried: its label goes through the same `t`.)
- [x] A canvas a plugin draws follows a switch between light and dark and a change of the primary colour. (A computed in the scratch plugin's render read `dark` and `value('--ui-primary')`: light with the default `oklch(58.5% 0.233 277.117)`, then dark with red `oklch(70.4% 0.191 22.216)`, then light with blue `oklch(62.3% 0.214 259.815)`, redrawn each time. Read through the page's computed style, not drawn on a `<canvas>`; S1 draws one.)
- [ ] A Lucide icon no core plugin uses draws in a release build with the network off. (Checked in `tauri dev` with the network on: `i-lucide-squirrel` drew from the installed set, with no request to the Iconify API among the page's resources and no `[Icon] failed to load` warning. The release build, which has the same `ssr: false` provider, wasn't built.)
- [x] `vue-tsc` in a plugin's project refuses a wrong prop on `SettingsRow`. (In the test plugin: `<SettingsRow labl="wrong"/>` → TS2345, `<ViewerLayout scroll-mode="sideways"/>` → TS2322; the right ones passed.)
- [x] Tests for the messages' merge and the manifest's key check; the SDK's build and `versions.test.ts` pass. (`shared/plugin/messages.test.ts`; the core layers through the same rule in `i18n.test.ts`; the preset refused a scratch plugin whose `zh-CN.json` lacked two keys.)

### As built

- **Contract:** `HostServices.i18n` (`t`, `locale`) and `HostServices.ui.theme` (`dark`, `value`); `shared/plugin/messages.ts` (`checkPluginMessages`, `messagesFor`, `messageLeaves`, `manifestKeys`); `shared/plugin/components.ts` (`<Name>Props`, `<Name>Emits` for each `/ui` component, re-exported from the SDK's main module), each component declaring its props with them (`SettingsRow`'s `setting` is a `string` now; it casts to `AppSettingPath` inside).
- **Rust** (`plugins.rs`): `read_locales` / `parse_locales`; `plugins_list` returns each plugin's `locales`; `bundle_hash` takes any number of parts, and a workspace copy's pin covers its locale files (name and bytes). The pin test covers them.
- **Frontend:** `loadInstalledPlugins(app, i18n, root, runs)` merges each loadable plugin's strings (the installed one's, then an accepted workspace copy's over them); `app/utils/plugins/theme.ts` (`pageTheme`, a `MutationObserver` on `<html>`'s class and style and on `<head>`); `app/plugins/icons.client.ts` (every `@iconify-json/*` set as its prefix's `setCustomIconLoader`, by an `import.meta.glob` of the installed sets: no list); `@iconify/vue` and `@iconify/utils` declared and pre-bundled (found at runtime otherwise: "head.hooks").
- **SDK:** the preset checks `locales/*.json` with `checkPluginMessages` and the manifest, and copies them; the build types `/ui`'s components from the contract (`new () => {$props: <Name>Props & EmitsToProps<<Name>Emits>}`) and fails on a component without its props there.
- **Tests:** the i18n test now checks each core layer with `checkPluginMessages` in one case instead of one per check and locale, so the count fell from 423 to 361 (51 files) with the same checks; `messages.test.ts` is new. 62 Rust tests; typecheck unchanged (the 7 errors in `@type32/latex2vue`).
- **Test plugin** (`../text-vertex-plugin`, `cb15cd2` on `dev`): `locales/en.json` and `zh-CN.json`, its view's label a key, its text through `ctx.i18n.t`; on the published SDK (`^1.1.0`) instead of `file:`. No new release: its releases are the update tests' fixture.
- **Template** (`Type-32/vertex-plugin-template`, public, a GitHub template, `main`): `plugin.json`, `package.json` (the SDK at `^1.1.0`), `vite.config.ts` (`vertex({pack: true})`), `tsconfig.json`, `locales/`, `src/` (a panel view with a string, an asset and a Nuxt UI button), `README.md` (making it yours, the dev loop, releasing), `.github/workflows/release.yml` (a `v*` tag: install, type-check, build, `gh release create … plugin.zip`). Its workflow ran green on a trial tag `v0.1.0` (the release had `plugin.zip`); tag and release deleted after, so the template carries none.
- **The SDK** `1.1.0` (the user, `5d973ca`), with all of the above.

## D1: Author docs, first draft

In `packages/vertex-plugin/docs/`. Written before the samples so they can be written from it; D2 finishes it.

### Change
- **Start:** a new plugin from the template to a panel view running in Vertex; the development loop (install from a
  folder, which is watched and reloads the window).
- **The package:** `plugin.json` key by key; one `main.js`, `styles.css`, assets; what the preset does; bundling a
  dependency; what can't be done (no native code; one file, so no imports at run time besides its assets).
- **The contract:** `PluginContext` and `SessionContext` member by member, each contribution point with a short
  example; strings; the theme.
- **UI:** the two tiers (`mount(el, props)`, the stable one; Vue components and `/ui`, which follow the app) and what
  each promises; Nuxt UI's components in a template; Tailwind through the SDK's stylesheet.
- **Config, data, secrets:** the schema's field types, scopes and `overridable`, `ctx.data`, `ctx.secrets`,
  permissions and what each grants.
- **Trust:** what a user is told at install, that a plugin runs as Vertex does, a workspace's plugins and their pins.
- **Publishing:** a release with `plugin.zip`, or a branch with the built files, each with a CI example; `repository`;
  how updates are found; pinning.
- **Versioning:** `apiVersion`, `minAppVersion`, what an alpha SDK means.
- **Carried from earlier phases:** Tailwind skips a project under a parent `.gitignore` that ignores it until it's a
  Git repository (C2b); how a view is named (C3); C1's Not done list.

### Acceptance
- [ ] Every member of `PluginContext` and `SessionContext` and every contribution point is in the docs (a test compares the docs' headings with the contract's names).
- [ ] The Start page, followed from an empty folder, ends with a plugin running in Vertex.

## The samples' shared acceptance

Each of S1 to S6, besides its own:

- [ ] Its repository builds and type-checks from a fresh clone; its `bun test` passes.
- [ ] A release with `plugin.zip`; installed from the repository for every workspace, and into a workspace.
- [ ] Works in en and zh-CN.
- [ ] Survives a relaunch: on, with its config, its data and what it had open.
- [ ] Written from the docs and the SDK's types only. Its gaps are rows under Gaps, each closed in Vertex first.
- [ ] Its README: what it shows of the contract, with links into the docs.

## S1: Graph

A relation graph like Obsidian's (`d3-force`, `d3-zoom` and `d3-drag`, bundled into its `main.js`; drawn on a canvas).

### Change
- Notes are nodes and links are edges, from `index.links()`; tags, attachments, unresolved links and orphans can be shown or hidden.
- A global view and a local one that follows the active tab to a set depth, both `tab: true`, opened by commands.
- Hovering a node highlights its neighbours, a click opens the note, nodes drag, the view pans and zooms.
- It follows the index (`index.on`) and the theme.
- Filters, colour groups and forces are its config: global, with per-workspace overrides.

### Acceptance
- [ ] A vault of 5,000 notes lays out and stays responsive while panning (frame times measured and written here).
- [ ] An edit that adds a link shows without reopening the view.
- [ ] Open in a pane and in a tab at once, each keeps its own layout.
- [ ] A workspace's override of a filter applies there only.

## S2: Settings sample

### Change
- Schema fields of every type, on the page Vertex draws from the manifest.
- A page of its own beside it, with a custom widget, drawn with `/ui`'s settings components.
- One key a workspace may override, one only a trusted workspace may.
- A secret (set, shown as set, deleted) and the `secrets` permission; a status item that shows the config it reads.

### Acceptance
- [ ] Each field type edits, resets and validates; the overridable key shows Changed in this workspace and Use global.
- [ ] The secret is in the OS keychain under the plugin's name and gone after Delete.
- [ ] Without the `secrets` permission in its manifest, the same call is refused.

## S3: Stat block

### Change
- A ` ```statblock ` code block drawn as a widget (a tabletop creature's stats, from YAML), editable in place.
- A slash item that inserts one.
- A piece of inline Markdown syntax (a dice roll, `{2d6+3}`), drawn and clickable.
- Both draw in notes, callouts, table cells and canvas cards.

### Acceptance
- [ ] The block and the inline syntax draw in each of the four places; a click in the widget edits the right block.
- [ ] Invalid YAML shows what's wrong in the block, and the note still edits.

## S4: Board

A new file format: `.board`, a kanban board as JSON whose cards hold Markdown.

### Change
- A file type with New Board (File → New, Files' menus, the palette) and an icon.
- A viewer that loads the file's text: columns and cards, dragged between columns, edited in place; saved through the viewer's text, so autosave and undo are the app's.
- A link extractor: `[[links]]` in cards count as the board's links (backlinks, the graph).

### Acceptance
- [ ] New Board creates and opens one; edits autosave; an invalid file shows what's wrong instead of a blank view.
- [ ] A note linked from a card lists the board under Backlinks; renaming the note updates the card.

## S5: Bases calendar

A community plugin on a core plugin's API.

### Change
- `requires: ["bases"]`; a Bases view registered with `ctx.use('bases').registerView`: a month calendar by a date property, with the view's options (which property, week start).
- A click on a day's entry opens the note; a click on an empty day makes a new item with that date.

### Acceptance
- [ ] The view is offered in a `.base` file and in a ` ```base ` block; with Bases off, the plugin is off and says why.
- [ ] Changing a note's date moves it on the calendar without reopening the base.

## S6: Navigator

A file browser that can replace Files.

### Change
- A panel view of the workspace's tree, with the kernel's file menu, New items and icons.
- Rows drag to the editor, to chat and to Finder; drops from outside import; file operations go through Files' undo.
- Thumbnails for images; per-folder data (a colour, a sort order) in `ctx.data.workspace`.

### Acceptance
- [ ] With Files off and the navigator in its place: create, rename, move, duplicate, delete and undo each; every row of SMOKE's Files section that isn't about Files' own look passes.
- [ ] A folder's colour survives a relaunch and travels with the vault.

## D2: Close

### Change
- The docs revised with every gap closed along the way; each sample linked where it shows a point.
- `SMOKE.md`: a Sample plugins section, a row per sample, installed from its repository.
- `Concepts and Structures.md` links the author docs and names the samples.
- The Plugin Architecture Plan's C4 ticked, with what this plan built.

### Acceptance
- [ ] The docs' contract test passes against the final contract.
- [ ] The six SMOKE rows pass on a release build.

## Not in this plan

- A plugin directory or catalog (the Plugin Architecture Plan leaves it a place).
- Windows and Linux runs of the samples: no machine here, as for C2.
- Native code in a plugin, or a sandbox.
- Publishing the samples anywhere but their repositories.

## Open questions

Each has a recommendation; the plan above assumes it. Answers change P0 only, except 3.

1. **How a plugin ships its strings.** Decided in P0: files (Decisions).
2. **Publishing the SDK.** Decided: published (Decisions).
3. **Who writes the samples.** Recommended: the docs first, then each sample by an agent that may read only the docs
   and the SDK's built types, listing what it lacked; the graph alone first, then one at a time in the order above.
   The other way: written here with the kernel's source in reach, keeping to the SDK's imports, which proves less
   about the docs.
4. **A template repository.** Decided: `Type-32/vertex-plugin-template` (Decisions).
5. **The new file format.** Recommended: `.board` (above), because its cards give the link extractor real work.
   Any small text format with links in it would do.
