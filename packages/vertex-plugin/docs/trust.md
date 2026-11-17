# Trust

A plugin runs as Vertex does: it can read and change the user's notes and files, and nothing sandboxes it. Users are
told so, and decide.

## Installing

The install dialog shows what the plugin says of itself (`name`, `version`, `author`, `description`), where it was
fetched from (and where it says it's from, when that differs), the [permissions](config.md#permissions) it asks for,
and that it runs as Vertex does. An update shows what changed in its version, permissions, requirements and
`apiVersion`. A plugin from another repository than the copy it would replace (which would get that one's settings,
data and secrets) needs its own confirmation.

So: ask only for the permissions the plugin uses, name its `repository`, and release from that repository
([Publishing](publishing.md)).

## A workspace's plugins

A workspace can carry plugins in its `.vertex/plugins/<id>/`, which travel with it (sync, Git). They run only in that
workspace's windows, once its folder is trusted and each plugin is accepted: trusting the folder lists them first,
with what each asks for. Acceptance pins the plugin's `plugin.json`, `main.js`, `styles.css` and strings: when any of
them changes (an update on another device, a pull), the plugin is off there until the user accepts it again. A
workspace's copy replaces an installed plugin with its id in that workspace.

A workspace also names where its plugins come from (`plugins.sources` in its settings), so another device can install
the ones it lacks.

## Programs in a vault

### `ctx.trust.allows`, `ctx.trust.trustFile`, `ctx.trust.trustFolder`, `ctx.trust.followEdit`, `ctx.trust.format`

For a plugin that runs programs from the vault (a workflow, a script), so every such plugin asks the same way and the
user manages them in one place, Settings → Trust. Paths are absolute; `hash` names a program's content.

```ts
ctx.trust.format({extensions: ['macro'], hash: async text => (await sha256(text))})

if (!await ctx.trust.allows(path, hash)) {
    // Ask the user, then:
    await ctx.trust.trustFile(path, hash)
}
```

- `allows(path, hash)`: whether it may run without asking: the file is trusted, or a folder covering it is (with this
  program, when trust remembers content).
- `trustFile(path, hash)`; `trustFolder(path, nested, pin?)`, its subfolders too with `nested`, `false` when the user
  declines (a folder whose workspace has plugins asks about them first).
- `followEdit(path, before, after)`: an edit made in Vertex keeps the file's trust with its new program.
- `format({extensions, hash})`: the files whose programs a folder's trust pins.

(`sha256` stands for the plugin's own hashing, `crypto.subtle.digest` for one.)
