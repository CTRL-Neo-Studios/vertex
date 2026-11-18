# Config, data, secrets

| What | Where it lives | Use it for |
| --- | --- | --- |
| [Config](#ctxconfig) | The user's settings, `plugins.config.<id>`; a workspace's `.vertex/settings.json` for what it may override | What the user sets: options, filters, colours. |
| [Data](#ctxdataglobal-ctxdataworkspace) | A JSON document of the plugin's, for the app or for a workspace | What the plugin keeps: state, caches, per-folder notes. |
| [Secrets](#ctxsecretsget-ctxsecretsset-ctxsecretsdelete) | The system's keychain | Keys and tokens. |

## Config

### `ctx.config`

```ts
import {definePlugin} from '@type32/vertex-plugin'
import {computed} from 'vue'

interface Config {
    depth: number
    showTags: boolean
}

export default definePlugin<Config>({
    setup(ctx) {
        const depth = computed(() => ctx.config.value.depth)
        void ctx.config.set({depth: 3})
    },
})
```

- `value`: the config in this window, a workspace's overrides applied, every [schema](#the-schema) field checked and
  defaulted. Reactive: it follows the Settings window, other windows and a change of workspace settings.
- `set(patch, scope)`: writes paths inside the config (`{depth: 3}`, `{'colors.tags': '#f00'}`), `null` removing one.
  `scope` is `global` (default: the user's settings) or `workspace` (this window's workspace, for a path the manifest
  lets it override; anything else is refused).
- `overridden(path)`: whether this window's workspace overrides the path.

### The schema

Settings the Settings window draws from `plugin.json`, without running the plugin: the plugin needs no settings page
of its own. With one ([`ctx.settings.page`](context.md#ctxsettingspage)), the fields are at its top, on the same
page. A field's `default` is the config's default, so `ctx.config.value` has it too.

```json
"config": {
  "overridable": {"showTags": "workspace", "folder": "trustedWorkspace"},
  "schema": [
    {"key": "depth", "type": "number", "label": "plugins.hello.depth", "description": "plugins.hello.depthHelp", "default": 2, "min": 1, "max": 5},
    {"key": "showTags", "type": "switch", "label": "plugins.hello.showTags", "default": true},
    {"key": "folder", "type": "path", "kind": "folder", "label": "plugins.hello.folder", "default": ""}
  ]
}
```

| `type` | Value | Extra keys |
| --- | --- | --- |
| `switch` | `true` / `false` | |
| `text` | a string | `placeholder` |
| `color` | a CSS colour | `placeholder` |
| `number` | a number | `min`, `max`, `step` |
| `select` | one of the options' `value`s | `options: [{value, label}]` (labels are i18n keys) |
| `list` | a list of strings | `placeholder` |
| `path` | a workspace-relative path | `kind`: `file` or `folder` (its picker shows while a workspace's settings are edited) |

Every field has `key` (a path in the config: `depth`, `colors.tags`), `type`, `label` and `default`. `description` is
optional and one line: Settings cuts a longer one. `info`, optional too, is for what takes more to say (why, what's
sent, what an option costs): it opens from an info button beside the label. `label`, `description`, `info` and
options' labels are i18n keys of the plugin's, which `en.json` must have.

### Workspace overrides

A workspace can change some of the user's settings for itself, in its `.vertex/settings.json`, which travels with it.
`overridable` says which of the plugin's paths: `workspace` (any workspace) or `trustedWorkspace` (only once the user
trusts it: a path a stranger's vault shouldn't set, like a folder the plugin writes to). A path not listed is the
user's only. Settings shows the overridable ones while a workspace is edited, with Changed in this workspace and Use
global.

On a page of its own, a plugin edits its config through its `config` prop (`ScopedConfig`), which is the scope
Settings is editing ([a settings page](ui.md#vertexs-components)).

## Data

### `ctx.data.global`, `ctx.data.workspace`

A JSON document of the plugin's: `global` in Vertex's data folder, `workspace` in the window's workspace
(`.vertex/plugins-data/<id>.json`, which travels with it; `undefined` outside a workspace window).

```ts
const store = ctx.data.workspace
if (store) {
    const colours = (await store.get() ?? {}) as Record<string, string>
    await store.set({...colours, projects: 'red'})
    store.onChange(value => console.log(value))
}
```

`get()` is `undefined` until something is set; `set(value)` replaces the document, atomically; `onChange` runs after
every write from any window. Keep it small: it's read and written whole.

## Secrets

### `ctx.secrets.get`, `ctx.secrets.set`, `ctx.secrets.delete`

Strings in the system's keychain (macOS Keychain, Windows Credential Manager), by name, the plugin's own: Vertex's
entries are `plugin:<id>:<name>`. `get` is `undefined` for a name with none. Needs the `secrets` permission.

```ts
await ctx.secrets.set('token', 'abc')
const token = await ctx.secrets.get('token')
```

## The network

### `ctx.http.fetch`

One GET from Vertex's native side, outside the webview's CORS rules, with the `Accept` header passed on. Redirects
come back unfollowed, the body stops past 2 MiB, and addresses on this computer or the local network are refused.
Needs the `network` permission.

```ts
const response = await ctx.http.fetch('https://api.example.com/items', {headers: {Accept: 'application/json'}})
const items = await response.json()
```

The webview's own `fetch` works too, under the web's rules: only from servers that allow it (CORS).

## Permissions

What a plugin may do beyond any window's own, in `plugin.json`'s `permissions`. The install dialog lists them; a call
the plugin hasn't asked for is refused.

| Permission | Grants |
| --- | --- |
| `network` | `ctx.http.fetch`. |
| `secrets` | `ctx.secrets`. |
| `files-outside-workspace` | Every file on the computer, in each window it runs in. Without it, a window reaches its workspace, the files the user picks in a dialog there, and the clipboard's. |
