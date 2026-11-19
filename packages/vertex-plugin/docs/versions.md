# Versions

Three numbers, each with its own job:

| | Where | Says |
| --- | --- | --- |
| `apiVersion` | `plugin.json` | The plugin contract the plugin is written against. `1` today. |
| `minAppVersion` | `plugin.json`, optional | The oldest Vertex that has what the plugin uses (`0.9.2`). |
| The SDK's version | `package.json`, `@type32/vertex-plugin` | The contract's types, the shared modules' versions, the preset. |

## `apiVersion`

What Vertex promises a plugin: the contract (`ctx`, `session`, the contribution points and their props) and the
versions of the [modules it shares](package.md#what-the-plugin-shares-with-vertex). Within one `apiVersion`, Vertex
only adds to the contract, so a plugin built for it keeps working in later Vertex releases. A change that breaks one
(a member removed, a shared package's new major: Vue 4, CodeMirror 7) is a new `apiVersion`; Vertex refuses a plugin
that asks for a newer one than it has.

## `minAppVersion`

An addition within an `apiVersion` (a new member of `ctx`) exists only in the Vertex releases since it was added. A
plugin that uses one sets `minAppVersion` to that release; an older Vertex keeps the plugin off and says why, instead
of failing when it calls what isn't there. Only the numbers count (`1.0.0` is met by `1.0.0-beta.1`), unless the
minimum names a pre-release itself (`1.0.0-beta.2`, since SDK 1.6.1): then earlier pre-releases of that version don't
meet it. A Vertex or SDK from before 1.6.1 refuses a minimum with a pre-release in it.

## The SDK

`@type32/vertex-plugin`'s major is the `apiVersion` it types (`1.x` is `apiVersion` 1); a minor adds to the contract;
its dependencies are the shared modules at Vertex's versions. Depend on it with `^` (`^1.2.0`), and update it to use
what a newer Vertex adds, with `minAppVersion` to match.

One change of 1.2.0 isn't an addition: a plugin's Tailwind classes carry the prefix `tw:` since then
([why](ui.md#styles)). A plugin built with an older SDK keeps running; its sources need the prefix when it moves to
1.2.0, or its classes write nothing.

1.2.0 also adds to `/ui` and the contract (Settings Plan): `SettingsRow`'s `stacked` and `info`, `SettingsSection`'s
`info` and `empty`, a schema field's `info`, `SettingsList` (with `SettingsListProps`, `SettingsListAction`,
`SettingsListFilter`) and `Markdown`; and `SettingsScrollLayout` draws inside Vertex's own layout on a plugin's
settings page. The preset copies `README.md` into the build and refuses a `description` over 160 characters or with
a line break. A plugin that uses the new components needs a Vertex that has them: set `minAppVersion` to the first
release with them.

1.3.0 adds `NoteEditor`'s `readonly` (a canvas card shown, not edited, draws through it).

1.4.0 adds an index entry's `icon`. With it, [`session.index.on`](session.md#sessionindexon) hears what Vertex does
itself (Files' New, Delete, Rename, moves and their undo), not only other programs, and a rename keeps a file's
`modifiedTime`. A plugin that relies on any of them sets `minAppVersion` to the first release with them.

1.4.0 also shares `@internationalized/date` (Nuxt UI's date inputs need Vertex's copy), and a plugin may import Nuxt
UI's components by file (`@nuxt/ui/components/Button.vue`), so a component library built on Nuxt UI works inside one
([UI](ui.md#nuxt-ui)). Both are the preset's and the host's: a plugin built with them needs a Vertex that has them, so
it sets `minAppVersion` to the first release with them. And a component with `defineModel` beside `defineProps`
builds: Vue's compiler imports `mergeModels` for it, which 1.3.0's preset didn't know Vertex's Vue has.

1.5.0 adds to the contract `ctx.dialogs.readText` and `writeText` (the text of what the plugin picked in an Open or
Save dialog) and `ctx.notifications.send`, behind a new permission, `notifications`. A plugin that uses them sets
`minAppVersion` to the first release with them; an older Vertex refuses a manifest asking for `notifications`. It
also exports the core plugins' API types by name (`BaseViewProps` for a Bases layout's component, `AiApi`,
`ChatApi`…), which 1.4.0 only put in `PluginApis`; types alone, so nothing changes at run time.

1.6.0 adds windows of a plugin's own: `ownWindows` in the manifest, `ctx.windows`, and `ctx.window.kind` `plugin`
in them ([Windows of its own](context.md#windows-of-its-own)). An older Vertex refuses a manifest with `ownWindows`
(an unknown key), so a plugin that declares them sets `minAppVersion` too.

1.6.0 also adds `ctx.plugin.name`, and `registerTool` to chat's API: a plugin's tools for a chat's model, each with
a `preview` of what it will change shown before it's approved ([Other plugins](context.md#other-plugins)). A plugin
that registers one checks `ctx.use('chat')?.registerTool` or sets `minAppVersion`. With them: `PluginMount`'s
`owner`, `removeFrontmatterProperty` in `/vault`, the workflows API's `Ops` and `dryRun`'s `quiet`.

1.6.0 also moves Nuxt UI to 4.13: `UToggle`, `UToggleGroup` and `UChatAttachment` resolve in a plugin's components.
A plugin that uses them sets `minAppVersion` to the first Vertex on 4.13.

1.7.0 adds bare windows (`ownWindows[].bare`) and `position`, `setPosition` and `workArea` to `WindowProps.window`
([Windows of its own](context.md#windows-of-its-own)). An older Vertex refuses a manifest with `bare` (an unknown key),
so a plugin that declares one sets `minAppVersion` to the first Vertex with them.

The contract's `/ui` components are Vue components drawn with Nuxt UI, so they follow those packages: a plugin that
draws with them may need changes when Vertex moves to Nuxt UI's next major. One drawn through `mount` doesn't
([UI](ui.md)).
