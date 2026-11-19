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

A dialog of the plugin's opens the same way, from anywhere (a command, a menu item): a component whose root is a
`UModal`, which emits `close` when it's done.

```ts
import {useOverlay} from '@nuxt/ui/composables'
import RenameModal from './RenameModal.vue'

const modal = useOverlay().create(RenameModal, {destroyOnClose: true})
const name = await modal.open({current: 'Hello'}).result // what `emit('close', value)` gave
```

Nothing else may be imported from `@nuxt/ui`: it would be a second Nuxt UI beside Vertex's, and the build refuses it.
The SDK types the components, so `vue-tsc` checks their props.

A component library built on Nuxt UI works when it imports Nuxt UI's components by file
(`import UButton from '@nuxt/ui/components/Button.vue'`): the build makes each one Vertex's component of that name. Its
stylesheet is imported with the plugin's (`import 'the-library/style.css'` in `main.ts`) and lands in `styles.css`; its
classes need a prefix of their own, as a plugin's do. Dates for Nuxt UI's date and time inputs are `@internationalized/date`'s,
which is Vertex's copy too; hold one in a `shallowRef` (`ref` types it as a plain object without its private fields).

### Icons

An icon is an Iconify name: `i-lucide-hand`, in an `icon` prop or `<UIcon name="i-lucide-hand"/>`. Lucide
(`i-lucide-*`, Vertex's own set) and Simple Icons (`i-simple-icons-*`, brands) draw offline. The `i-…` classes of
Nuxt's icon CSS aren't in a plugin's Tailwind: draw an icon with `UIcon`.

## Vertex's components

From `@type32/vertex-plugin/ui`, so a plugin's UI looks and behaves as Vertex's. Their props are the contract's
(`SettingsRowProps`, `ViewerLayoutProps`… in `@type32/vertex-plugin`), and `vue-tsc` checks them.

| Component | |
| --- | --- |
| `SettingsScrollLayout` | A settings page: the title (`title`) and the `header-leading` and `header-trailing` slots in a header over the scrolling content. On a [`ctx.settings.page`](context.md#ctxsettingspage), Settings already lays the page out: this draws its content there, its title and header slots in that page's header. `globalOnly` marks a page none of whose settings a workspace may change. |
| `SettingsSection` | A group of rows under a title, with a reset button while `dirty` (emits `reset`). `description` is one line; `info` is what takes more, behind an info button; `empty` is what to say while it has no rows. Buttons go in its `actions` slot. |
| `SettingsRow` | One setting: `label`, `description` (one line: a longer one is cut), `info`, `icon`, `error`; the control is the default slot. `stacked` puts the control below the label at full width (an editor, a list); a stacked row without a `label` is its content alone (a notice). `setting` (`config.path('depth')`) makes it follow the scope Settings edits: Global only, Changed in this workspace, Use global. |
| `SettingsList` | A list in a section: `items` (each with an `id`; their type is what `text`, `group`, `filters` and `actions` get), `text(item)` for its search, `empty`, the `row` and `actions` slots (`{item}`). With `actions` (`{id, label(count), icon, color, confirm(count), applies(item), run(items)}`), a checkbox per row, one for all shown, and a button per action for the selection. `group(item)` puts headings between rows; `filters` (`{id, label, test(item)}`, the first the default) a select beside the search; `v-model:query` and `v-model:filter` hold them. |
| `ViewerLayout` | A file viewer's frame: the editable title (`v-model:fileName`, `@on-rename`), the content (the default slot), the status bar with the registered status items. |
| `NoteEditor` | A Markdown editor inside something else (a card, a form): `text`, `notePath`; emits `update`, `done` (Esc), `openLink`. `readonly` shows it without editing (a canvas card that isn't being edited): no cursor, no `update`; only its links, buttons and widgets take a click. |
| `PluginMount` | Draws a contribution's UI with props (another plugin's embed, from `session.editor.embedFor`). `owner` names the plugin it fails for when the UI isn't a registered contribution. |
| `VaultPicker` | The workspace's files or folders, inline (`v-model`: workspace-relative paths). |
| `TextDiff` | Two texts line by line, numbered and folded (`sides: {before, after}`). |
| `Markdown` | Someone else's Markdown, drawn as Vertex draws a plugin's README (`value`): no raw HTML, Vue components or attributes (they show as text); links open in the browser, web and mail ones only; a relative image draws from `assetUrl` (give `ctx.plugin.assetUrl`), a remote one only once the reader clicks Load images. |

And two functions: `openExternal(url)` opens a web or mail link in the default browser or mail app (anything else is
refused), and `useScrollFade(element)`, the classes that fade a scroll area's edges as Vertex's panels do.

A section holds rows and nothing else: a row is what pads, so every page lines up. A settings page, all three Settings
components together:

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
            <SettingsRow label="Depth" description="How many links away to look." :setting="config.path('depth')">
                <UInputNumber :model-value="config.value('depth') as number" :min="1" :max="5" @update:model-value="v => config.set({depth: v})"/>
            </SettingsRow>
            <SettingsRow stacked label="Notes" info="Kept with the workspace, and shown to nobody else." :setting="config.path('notes')">
                <UTextarea class="tw:w-full" :model-value="config.value('notes') as string" @update:model-value="v => config.set({notes: v})"/>
            </SettingsRow>
        </SettingsSection>
    </SettingsScrollLayout>
</template>
```

(Labels are text here to keep it short; a plugin's come from `ctx.i18n.t`.)

## Styles

`@import "@type32/vertex-plugin/tailwind.css";` at the top of the plugin's CSS gives it Tailwind, against Vertex's
theme. A plugin's classes carry the prefix `tw:`, before everything else in the class:

```vue
<template>
    <div class="tw:flex tw:items-center tw:gap-2 tw:p-3 tw:text-sm tw:text-muted tw:hover:bg-elevated">
        <UButton class="tw:w-full" :ui="{label: 'tw:truncate'}" label="Open"/>
    </div>
</template>
```

The build writes the prefixed classes the plugin uses into its `styles.css`; a class without the prefix isn't the
plugin's and writes nothing.

- **Why a prefix:** the plugin's stylesheet loads beside Vertex's, and two stylesheets that both define `.p-4` can't be
  ordered against each other: a plugin's `p-4`, loaded later, would undo the `sm:p-6` of every card and modal in the
  window. With its own names a plugin's CSS sets nothing on Vertex's elements, and a Vertex update can't change how the
  plugin looks.
- **Everything else is Tailwind as usual:** variants after the prefix (`tw:hover:…`, `tw:sm:…`, `tw:dark:…`), the
  markers too (`tw:group` with `tw:group-hover:…`, `tw:peer`), arbitrary values (`tw:w-[42px]`), opacity
  (`tw:bg-primary/20`).
- **The theme:** Nuxt UI's colours (`tw:text-muted`, `tw:bg-elevated`, `tw:border-default`, `tw:text-primary`),
  Tailwind's palette and spacing, Vertex's fonts (`tw:font-sans`, `tw:font-mono`) and its own utilities
  (`tw:no-scrollbar`). The colours and fonts are CSS variables, so they follow the user's colours, light and dark,
  and fonts by themselves. For what CSS can't reach (a canvas), read
  [`ctx.ui.theme`](context.md#ctxuithemedark-ctxuithemevalue).
- **On a Nuxt UI component**, a class of yours (`class`, `ui`) wins over the component's own of the same weight, since
  the plugin's stylesheet comes later: `tw:rounded-full` rounds a button. The component keeps its states that weigh
  more (`hover:`, `disabled:`); override those with the same variant (`tw:hover:bg-…`).
- **No preflight, nothing on `:root`.** Plain CSS a plugin writes (a `<style>` in a component, a rule in its CSS file)
  is the page's, like any CSS: scope it (`<style scoped>`, a class starting with the plugin's id). It's the way to
  style what the plugin adds to Vertex's own elements, like an editor decoration's class.
- Tailwind finds the classes in the project's files, skipping what Git ignores. A `.gitignore` in a folder above the
  project that ignores it hides them until the project is a Git repository of its own (`git init`).
