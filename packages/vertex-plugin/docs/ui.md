# UI

Everything a plugin draws (a view, a viewer, a tab, a code block, a settings page) is a `UiSlot`, given one of two
ways:

| | `mount(el, props)` | `component` |
| --- | --- | --- |
| What it is | A function that draws into `el` and returns what undoes it. | A lazily loaded Vue component that gets the props. |
| With | Anything: the DOM, a canvas, another framework, a library that wants an element. | Vue, Nuxt UI's components, Vertex's own (`/ui`). |
| Promise | Stable: the props are the contract's, and nothing else of Vertex's is involved. | Follows Vertex's Vue and Nuxt UI: a new major of Nuxt UI can break a template. |
| On a change of props | `mount` runs again, after what it returned has run. | Vue updates the component. |

Either way it draws inside an error boundary: what throws shows "{name} couldn't draw this" in its place, with the
error, and the rest of Vertex goes on.

```ts
ctx.views.panel({
    id: 'hello-canvas',
    label: 'plugins.hello.canvas',
    icon: 'i-lucide-chart-scatter',
    defaultArea: 'bottom',
    mount(el, {session}) {
        const canvas = el.appendChild(document.createElement('canvas'))
        canvas.dataset.files = String(session.index.files().length)
        return () => canvas.remove()
    },
})
```

## Vue

A component loader is `() => import('./View.vue')`, or a component made on the spot when it needs `ctx`:

```ts
import {h} from 'vue'
import View from './View.vue'

ctx.views.panel({
    id: 'hello',
    label: 'plugins.hello.view',
    icon: 'i-lucide-hand',
    defaultArea: 'right',
    component: async () => ({render: () => h(View, {ctx})}),
})
```

A view's component gets the point's props (`PanelViewProps`, `ViewerProps`…) as props; one made with `h` gets what it
passes. `vue` is Vertex's own copy, so `ref`, `computed`, `watch`, `provide` and `inject` work with Vertex's, and
what's reactive in the contract (`ctx.i18n`, `ctx.config.value`, `session.index`) is reactive in a template.

## Nuxt UI

Vertex is drawn with [Nuxt UI](https://ui.nuxt.com) v4, and a plugin's templates have every one of its components by
name, as Vertex's do:

```vue
<script setup lang="ts">
import {ref} from 'vue'

const query = ref('')
const refresh = () => {}
</script>

<template>
    <UButton label="Refresh" icon="i-lucide-refresh-cw" variant="soft" @click="refresh"/>
    <UInput v-model="query" placeholder="Filter"/>
</template>
```

In a render function, `resolveComponent('UButton')` (from `vue`). The composables come from `@nuxt/ui/composables`
(`useToast`, `useOverlay`), so a plugin's toast is Vertex's:

```ts
import {useToast} from '@nuxt/ui/composables'

useToast().add({title: ctx.i18n.t('plugins.hello.done'), color: 'success'})
```

Nothing else may be imported from `@nuxt/ui`: it would be a second Nuxt UI beside Vertex's, and the build refuses it.
The SDK types the components, so `vue-tsc` checks their props.

### Icons

An icon is an Iconify name: `i-lucide-hand`, in an `icon` prop or `<UIcon name="i-lucide-hand"/>`. Lucide
(`i-lucide-*`, Vertex's own set) and Simple Icons (`i-simple-icons-*`, brands) draw offline. The `i-…` classes of
Nuxt's icon CSS aren't in a plugin's Tailwind: draw an icon with `UIcon`.

## Vertex's components

From `@type32/vertex-plugin/ui`, so a plugin's UI looks and behaves as Vertex's. Their props are the contract's
(`SettingsRowProps`, `ViewerLayoutProps`… in `@type32/vertex-plugin`), and `vue-tsc` checks them.

| Component | |
| --- | --- |
| `SettingsScrollLayout` | A settings page: the title (`title`) in a header over the scrolling content. `globalOnly` marks a page none of whose settings a workspace may change. |
| `SettingsSection` | A group of rows under a title, with a reset button while `dirty` (emits `reset`). |
| `SettingsRow` | One setting: `label`, `description`, `icon`, `error`; the control is the default slot. `setting` (`config.path('depth')`) makes it follow the scope Settings edits: Global only, Changed in this workspace, Use global. |
| `ViewerLayout` | A file viewer's frame: the editable title (`v-model:fileName`, `@on-rename`), the content (the default slot), the status bar with the registered status items. |
| `NoteEditor` | A Markdown editor inside something else (a card, a form): `text`, `notePath`; emits `update`, `done` (Esc), `openLink`. |
| `PluginMount` | Draws a contribution's UI with props (another plugin's embed, from `session.editor.embedFor`). |
| `VaultPicker` | The workspace's files or folders, inline (`v-model`: workspace-relative paths). |
| `TextDiff` | Two texts line by line, numbered and folded (`sides: {before, after}`). |

And two functions: `openExternal(url)` opens a web or mail link in the default browser or mail app (anything else is
refused), and `useScrollFade(element)`, the classes that fade a scroll area's edges as Vertex's panels do.

A settings page, all three Settings components together:

```vue
<script setup lang="ts">
import type {SettingsPageProps} from '@type32/vertex-plugin'
import {SettingsRow, SettingsScrollLayout, SettingsSection} from '@type32/vertex-plugin/ui'

defineProps<SettingsPageProps>()
const defaults = {depth: 2}
</script>

<template>
    <SettingsScrollLayout title="Hello">
        <SettingsSection title="Graph" :dirty="config.isDirty(['depth'], defaults)" @reset="config.reset(['depth'], defaults)">
            <SettingsRow label="Depth" :setting="config.path('depth')">
                <UInputNumber :model-value="config.value('depth') as number" :min="1" :max="5" @update:model-value="v => config.set({depth: v})"/>
            </SettingsRow>
        </SettingsSection>
    </SettingsScrollLayout>
</template>
```

(Labels are text here to keep it short; a plugin's come from `ctx.i18n.t`.)

## Styles

`@import "@type32/vertex-plugin/tailwind.css";` at the top of the plugin's CSS gives it Tailwind's utilities against
Vertex's theme: `text-muted`, `bg-elevated`, `border-default`, `text-primary` and the other Nuxt UI colours, Tailwind's
palette and spacing, Vertex's fonts. The build writes the classes the plugin uses into its `styles.css`.

- **No preflight, nothing on `:root`**, but a plugin's rules are the page's: a utility applies to any element with its
  class, Vertex's too. Tailwind writes one for every word of the sources that names one, in scripts as well as
  templates (a variable named `resize` or `container`, the word `hidden` in a string), so a plugin can restyle Vertex's
  elements that use the same class by accident. Keep Tailwind to templates whose words you control, or write plain CSS
  scoped to the plugin's own elements (`<style scoped>`, a class of the plugin's id), as the graph sample does.
- **The theme follows by itself:** Nuxt UI's colours are CSS variables, so `text-primary` changes with the user's
  colour and light or dark. For what CSS can't reach (a canvas), read
  [`ctx.ui.theme`](context.md#ctxuithemedark-ctxuithemevalue).
- **Dark mode:** `dark:` variants work (Vertex puts `dark` on `<html>`), though the semantic colours (`text-muted`,
  `bg-default`) already switch.
- Tailwind finds the classes in the project's files, skipping what Git ignores. A `.gitignore` in a folder above the
  project that ignores it hides them until the project is a Git repository of its own (`git init`).
