# Writing a Vertex plugin

A Vertex plugin is a folder: `plugin.json`, one `main.js`, maybe `styles.css`, its strings and its assets. Vertex
loads it at runtime in its windows, where it adds what it registers: panel views, tabs, file viewers, file types,
commands, editor syntax and widgets, settings pages. It's written in TypeScript and Vue against this package,
`@type32/vertex-plugin`, whose types are the contract and whose Vite preset builds the folder.

Vertex's own features are plugins on the same contract (Files, Canvas, Bases, Git, Chat…), so what they do, a plugin
can do.

| Page | What's in it |
| --- | --- |
| [Start](start.md) | A plugin from an empty folder to a panel running in Vertex; the development loop. |
| [The package](package.md) | `plugin.json` key by key; what the build makes; dependencies; strings; what can't be done. |
| [The plugin's context](context.md) | `ctx`, what `setup` gets: every contribution point, with an example. |
| [The session](session.md) | `session`, what views and `onSession` get: the workspace's index, files, tabs, editors. |
| [UI](ui.md) | Mounting, Vue and Nuxt UI, Vertex's own components, Tailwind, the theme. |
| [Config, data, secrets](config.md) | Settings drawn from the manifest, workspace overrides, stored documents, the keychain, the network, permissions. |
| [Trust](trust.md) | What a user is told and agrees to; a workspace's plugins; trust for programs a plugin runs. |
| [Publishing](publishing.md) | Releases with `plugin.zip`, a branch of built files, updates, pins. |
| [Versions](versions.md) | `apiVersion`, `minAppVersion`, this package's versions. |

The types say more than these pages: each member is documented where it's declared, so an editor shows it on hover.
A starting point: [`Type-32/vertex-plugin-template`](https://github.com/Type-32/vertex-plugin-template).
