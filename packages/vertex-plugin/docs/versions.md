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
of failing when it calls what isn't there.

## The SDK

`@type32/vertex-plugin`'s major is the `apiVersion` it types (`1.x` is `apiVersion` 1); a minor adds to the contract;
its dependencies are the shared modules at Vertex's versions. Depend on it with `^` (`^1.2.0`), and update it to use
what a newer Vertex adds, with `minAppVersion` to match.

One change of 1.2.0 isn't an addition: a plugin's Tailwind classes carry the prefix `tw:` since then
([why](ui.md#styles)). A plugin built with an older SDK keeps running; its sources need the prefix when it moves to
1.2.0, or its classes write nothing.

The contract's `/ui` components are Vue components drawn with Nuxt UI, so they follow those packages: a plugin that
draws with them may need changes when Vertex moves to Nuxt UI's next major. One drawn through `mount` doesn't
([UI](ui.md)).
