<script setup lang="ts">
import type {
    InternalLink,
    InternalLinkClickDetail,
    SpecialCodeBlockMapping
} from "#codemirror-rich-obsidian-editor/editor-types";
import type {EditorState, Extension} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import {selectAll} from "@codemirror/commands";
import {readText, writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {ContextMenuItem} from "@nuxt/ui";
import type {HeaderToolsPosition} from "#shared/types/app/settings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useChats} from "~/composables/ai/useChats";
import {aiFeatureOn} from "~/composables/ai/useAiConfig";
import useQuickToasts from "~/composables/utility/useQuickToasts";

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    specialCodeBlockMapping: SpecialCodeBlockMapping[],
    extensions?: Extension[],
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})
const frontmatterOpen = useState<boolean>(props?.filePath, () => false)

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
    (e: 'on-clicked-internal-link', detail: InternalLinkClickDetail): void
}>()

onBeforeUnmount(() => {
    frontmatterOpen.value = false
})

// Header tools: the editor's latest state drives their enabled/active looks; each group sits where settings say.
const {effective} = useSettingsScope()
const editorState = shallowRef<EditorState>()
const stateTracker = EditorView.updateListener.of(update => { editorState.value = update.state })
const editorExtensions = computed(() => [...(props.extensions ?? []), stateTracker])
const editorView = computed(() => unref((editorInstance.value as {view?: MaybeRef<EditorView | undefined>} | undefined)?.view))
watch(editorView, view => { if (view) editorState.value = view.state }, {immediate: true})
function toolsAt(side: HeaderToolsPosition) {
    const panel = effective.value?.viewConfig.editorPanel
    return (['history', 'format'] as const).filter(tools => (tools === 'history' ? panel?.headerHistory : panel?.headerFormatting) === side)
}

// The editor's right-click menu (replaces the webview's, so spelling suggestions and Look Up are gone). Tables keep
// their own: their menu takes the event first. Ask in chat needs a workspace (chats belong to one) and Chat on.
const {t} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const {root: chatsRoot, askInChat} = useChats(useActiveSessions().getSession(computed(() => $route.params.sessionId as string)))
const selected = ref('')
const readOnly = computed(() => props.disabled || frontmatterOpen.value || props.renaming)

function onMenuOpen(open: boolean) {
    const state = editorView.value?.state
    if (open && state) selected.value = state.sliceDoc(state.selection.main.from, state.selection.main.to)
}

/** Runs a menu action on the editor, then gives it focus back; failures (clipboard, chats) show as a toast. */
function act(action: (view: EditorView) => unknown) {
    return async () => {
        const view = editorView.value
        if (!view) return
        try {
            await action(view)
        } catch (e) {
            $qt.error(t('app.editor.ui.editFailed'), e instanceof Error ? e.message : String(e))
        }
        view.focus()
    }
}

// Ask in chat runs once the menu has closed: closing puts focus back in the editor, which would take it from the
// chat's prompt.
let askAfterClose: string | null = null
function onCloseAutoFocus(event: Event) {
    if (askAfterClose === null) return
    event.preventDefault()
    const quote = askAfterClose
    askAfterClose = null
    askInChat(quote, props.filePath).catch(e => $qt.error(t('app.editor.ui.editFailed'), e instanceof Error ? e.message : String(e)))
}

// Paste goes through a paste event, so CodeMirror's and the editor's paste handling (links, tables) still apply.
async function paste(view: EditorView) {
    const data = new DataTransfer()
    data.setData('text/plain', await readText())
    view.focus()
    view.contentDOM.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}))
}

const menuItems = computed<ContextMenuItem[][]>(() => {
    const none = !selected.value
    const canvas = 'app.editor.ui.workflowCanvas'
    return [
        [
            {label: t(`${canvas}.cut`), icon: 'i-lucide-scissors', kbds: ['meta', 'x'], disabled: none || readOnly.value, onSelect: act(async view => {
                await writeText(selected.value)
                view.dispatch({...view.state.replaceSelection(''), userEvent: 'delete.cut'})
            })},
            {label: t(`${canvas}.copy`), icon: 'i-lucide-copy', kbds: ['meta', 'c'], disabled: none, onSelect: act(() => writeText(selected.value))},
            {label: t(`${canvas}.paste`), icon: 'i-lucide-clipboard-paste', kbds: ['meta', 'v'], disabled: readOnly.value, onSelect: act(paste)},
            {label: t(`${canvas}.selectAll`), icon: 'i-lucide-text-select', kbds: ['meta', 'a'], onSelect: act(view => selectAll(view))},
        ],
        ...(chatsRoot.value && aiFeatureOn(effective.value?.aiConfig, 'chat') ? [[
            {label: t('app.editor.ui.askInChat'), icon: 'i-lucide-message-square-quote', disabled: none, onSelect: () => { askAfterClose = selected.value }},
        ]] : []),
    ]
})
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="vertical"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
    >
        <template #default>
            <ViewerEditorComponentFrontmatterEditor class="max-w-2xl w-full" v-model:open="frontmatterOpen" v-model:editorInstance="editorInstance"/>
            <UContextMenu :items="menuItems" :content="{ onCloseAutoFocus }" @update:open="onMenuOpen">
                <Editor
                    :disabled="readOnly"
                    :extensions="editorExtensions"
                    ref="editorInstance"
                    v-model="content"
                    class="max-w-2xl w-full"
                    :special-code-block-map="props.specialCodeBlockMapping"
                    :internal-link-map="props.internalLinkList"
                    @update:model-value="() => contentSaved = false"
                    @internal-link-click="(detail) => emit('on-clicked-internal-link', detail)"
                />
            </UContextMenu>
        </template>
        <template #header-left>
            <ViewerEditorComponentHeaderTools v-for="tools in toolsAt('left')" :key="tools" :tools="tools" :view="editorView" :state="editorState" :disabled="disabled || frontmatterOpen || renaming"/>
        </template>
        <template #header-right>
            <ViewerEditorComponentHeaderTools v-for="tools in toolsAt('right')" :key="tools" :tools="tools" :view="editorView" :state="editorState" :disabled="disabled || frontmatterOpen || renaming"/>
        </template>
        <template #status-bar>
            <ViewerEditorComponentWordCounter v-model="content"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>