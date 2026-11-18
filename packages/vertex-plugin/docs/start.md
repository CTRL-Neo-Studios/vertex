# Start

From an empty folder to a panel view running in Vertex. You need [Bun](https://bun.sh) (or Node with npm) and Vertex.

The quick way is the template, which holds the files below: **Use this template** on
[`Type-32/vertex-plugin-template`](https://github.com/Type-32/vertex-plugin-template) and skip to [Build](#build). By
hand:

## The files

The plugin's id is `hello` here. An id is lowercase letters, digits and inner hyphens; it names the plugin's strings,
settings, data and secrets, so it doesn't change once people use the plugin.

`plugin.json`, what Vertex knows without running the plugin ([every key](package.md#pluginjson)):

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "0.1.0",
  "description": "Says hello.",
  "icon": "i-lucide-hand",
  "apiVersion": 1
}
```

`package.json`:

```json
{
  "name": "hello",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "typecheck": "vue-tsc -p ."
  },
  "devDependencies": {
    "@type32/vertex-plugin": "^1.2.0",
    "@vitejs/plugin-vue": "^6.0.0",
    "typescript": "^6.0.3",
    "vite": "^8.3.8",
    "vue-tsc": "^3.3.14"
  }
}
```

`vite.config.ts`: `vertex()` builds `src/main.ts`, `plugin.json`, `locales/` and `public/` into `dist/`
([what it does](package.md#the-build)):

```ts
import vue from '@vitejs/plugin-vue'
import {vertex} from '@type32/vertex-plugin/vite'
import {defineConfig} from 'vite'

export default defineConfig({plugins: [vue(), vertex()]})
```

`tsconfig.json`; the SDK's types include Nuxt UI's components, so `vue-tsc` checks `<UButton>` in a template:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "@type32/vertex-plugin"]
  },
  "include": ["src"]
}
```

`locales/en.json`, the plugin's strings, all under `plugins.<id>` ([strings](package.md#strings)). Add
`locales/zh-CN.json` with the same keys for Chinese:

```json
{
  "plugins": {
    "hello": {
      "view": "Hello",
      "greeting": "Hello, {name}"
    }
  }
}
```

`src/main.ts`, the entry. `setup` runs once in each window the plugin runs in and registers what it adds
([`ctx`](context.md)):

```ts
import {definePlugin} from '@type32/vertex-plugin'
import {h} from 'vue'
import View from './View.vue'
import './style.css'

export default definePlugin({
    setup(ctx) {
        ctx.views.panel({
            id: 'hello',
            label: 'plugins.hello.view',
            icon: 'i-lucide-hand',
            defaultArea: 'right',
            component: async () => ({render: () => h(View, {ctx})}),
        })
    },
})
```

`src/View.vue`, the panel. Nuxt UI's components are there by name, as in Vertex's own templates ([UI](ui.md)):

```vue
<script setup lang="ts">
import type {PluginContext} from '@type32/vertex-plugin'

const props = defineProps<{ ctx: PluginContext }>()
const {t} = props.ctx.i18n
</script>

<template>
    <div class="tw:flex tw:items-center tw:gap-2 tw:p-3 tw:text-sm tw:text-muted">
        <span>{{ t('plugins.hello.greeting', {name: 'Vertex'}) }}</span>
        <UButton size="xs" icon="i-lucide-sparkles" variant="soft"/>
    </div>
</template>
```

`src/style.css`, Tailwind against Vertex's theme; a plugin's classes carry the prefix `tw:` ([styles](ui.md#styles)):

```css
@import "@type32/vertex-plugin/tailwind.css";
```

## Build

```sh
bun install
bun run build
bun run typecheck
```

`dist/` now holds `plugin.json`, `main.js`, `styles.css` and `locales/`: the plugin as Vertex installs it. The build
fails with what's wrong when `plugin.json` or a locale file breaks a rule.

> If the build finds none of your Tailwind classes (`styles.css` nearly empty), a `.gitignore` in a folder above the
> project probably ignores it: Tailwind skips ignored files until the project is a Git repository of its own. Run
> `git init` in it.

## Run it in Vertex

Settings → Plugins → the arrow beside **Install…** → **From a folder (development)…**, and pick `dist/`. The dialog
shows what the plugin is and asks; **Install** turns it on. In a workspace window, open the right sidebar (the button
at the window's top right): its header has the view's icon, the hand, and a click on it shows "Hello, Vertex".

Pick `dist/`, not the project: the folder you pick is copied as it is and watched.

## The development loop

A plugin installed from a folder stays watched while that folder is its source: when its files change, Vertex copies
them again, and each window running the plugin saves its session and reloads. So keep a build running:

```sh
bunx vite build --watch
```

and each save of a source file shows in Vertex a moment later. An error in `setup` or in what the plugin draws shows
in Vertex as "Hello couldn't start" or in place of the view; the window's web inspector has the stack and the
console (on macOS, Safari → Develop → your Mac's name → the Vertex window).

To ship it, see [Publishing](publishing.md).
