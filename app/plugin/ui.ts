/**
 * The UI community plugins may import: the Settings building blocks, `ViewerLayout` (a file viewer's header, rename and
 * status bar, with the registered status items), `NoteEditor` (a markdown editor inside something else: a canvas
 * card), `PluginMount` (draws another plugin's contribution, an embed from `session.editor.embedFor`), `openExternal`
 * (a web or mail link in the default app; anything else refused), `useScrollFade` (a scroll area's fading edges, as
 * the panels have), and the Nuxt UI components the app itself uses most,
 * under the names its templates use. These are Vue components, so a plugin using them follows Vue and Nuxt UI: Nuxt
 * UI's next major can break them. A plugin that needs to outlast that draws its own DOM through `mount`, the stable tier.
 */
export {default as SettingsRow} from '~/components/Settings/Row.vue'
export {default as SettingsSection} from '~/components/Settings/Section.vue'
export {default as SettingsScrollLayout} from '~/components/Settings/ScrollLayout.vue'
export {default as ViewerLayout} from '~/components/ViewerEditor/LayoutWrapper.vue'
export {default as NoteEditor} from '~/components/NoteEditor.vue'
export {default as PluginMount} from '~/components/PluginMount.vue'
export {openUrlInBrowser as openExternal} from '~/composables/app/useAppOpener'
export {useScrollFade} from '~/composables/utility/useScrollFade'

export {default as UAlert} from '@nuxt/ui/components/Alert.vue'
export {default as UBadge} from '@nuxt/ui/components/Badge.vue'
export {default as UButton} from '@nuxt/ui/components/Button.vue'
export {default as UCheckbox} from '@nuxt/ui/components/Checkbox.vue'
export {default as UContextMenu} from '@nuxt/ui/components/ContextMenu.vue'
export {default as UDropdownMenu} from '@nuxt/ui/components/DropdownMenu.vue'
export {default as UEmpty} from '@nuxt/ui/components/Empty.vue'
export {default as UForm} from '@nuxt/ui/components/Form.vue'
export {default as UFormField} from '@nuxt/ui/components/FormField.vue'
export {default as UIcon} from '@nuxt/ui/components/Icon.vue'
export {default as UInput} from '@nuxt/ui/components/Input.vue'
export {default as UInputTags} from '@nuxt/ui/components/InputTags.vue'
export {default as UModal} from '@nuxt/ui/components/Modal.vue'
export {default as UPopover} from '@nuxt/ui/components/Popover.vue'
export {default as UScrollArea} from '@nuxt/ui/components/ScrollArea.vue'
export {default as USelect} from '@nuxt/ui/components/Select.vue'
export {default as USelectMenu} from '@nuxt/ui/components/SelectMenu.vue'
export {default as USeparator} from '@nuxt/ui/components/Separator.vue'
export {default as USwitch} from '@nuxt/ui/components/Switch.vue'
export {default as UTextarea} from '@nuxt/ui/components/Textarea.vue'
export {default as UTooltip} from '@nuxt/ui/components/Tooltip.vue'
