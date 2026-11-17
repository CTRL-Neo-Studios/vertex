/**
 * The app's own UI community plugins may import: the Settings building blocks, `ViewerLayout` (a file viewer's header,
 * rename and status bar, with the registered status items), `NoteEditor` (a markdown editor inside something else: a
 * canvas card), `PluginMount` (draws another plugin's contribution, an embed from `session.editor.embedFor`),
 * `VaultPicker` (files or folders of the workspace, inline; `session.files.pick` is its dialog), `TextDiff` (two texts
 * side by side or inline, numbered and folded, with a `header` slot), `openExternal` (a web or mail link in the default
 * app; anything else refused) and `useScrollFade` (a scroll area's fading edges, as the panels have). Nuxt UI itself
 * comes from the app too: every component by name (`<UButton>`), its composables from `@nuxt/ui/composables`
 * (`app/utils/plugins/community.ts`). These are Vue components, so a plugin using them follows Vue and Nuxt UI: Nuxt
 * UI's next major can break them. A plugin that needs to outlast that draws its own DOM through `mount`, the stable tier.
 */
export {default as SettingsRow} from '~/components/Settings/Row.vue'
export {default as SettingsSection} from '~/components/Settings/Section.vue'
export {default as SettingsScrollLayout} from '~/components/Settings/ScrollLayout.vue'
export {default as ViewerLayout} from '~/components/ViewerEditor/LayoutWrapper.vue'
export {default as NoteEditor} from '~/components/NoteEditor.vue'
export {default as PluginMount} from '~/components/PluginMount.vue'
export {default as VaultPicker} from '~/components/VaultPicker.vue'
export {default as TextDiff} from '~/components/Diff/TextDiff.vue'
export {openUrlInBrowser as openExternal} from '~/composables/app/useAppOpener'
export {useScrollFade} from '~/composables/utility/useScrollFade'
