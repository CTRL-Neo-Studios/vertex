<script setup lang="ts">
import type {ExternalLinkClickDetail, InternalLinkClickDetail} from "@type32/codemirror-rich-obsidian-editor";
import type {EditorState} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import {selectAll} from "@codemirror/commands";
import {readText, writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {ContextMenuItem} from "@nuxt/ui";
import type {PluginMenuItem} from "#shared/plugin/api";
import type {HeaderToolsPosition} from "#shared/types/app/settings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useNoteEditor} from "~/composables/active/editor/useNoteEditor";
import {usePropertiesOptions} from "~/composables/active/editor/usePropertiesOptions";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {noteMenuItems} from "~/utils/contributions";

/**
 * The kernel's markdown viewer (`.md`, `.txt`): the rich editor, with what plugins add to note editors
 * (`useNoteEditor`) and to its right-click menu (`noteMenuItems`). The `ViewerProps` it doesn't declare are dropped.
 */
defineOptions({inheritAttrs: false})

const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    sessionId: string,
    fileId: string,
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})

const emit = defineEmits<{
    (e: 'rename', oldValue: string, newValue: string): void
}>()

const session = useActiveSessions().getSession(props.sessionId)
// Drawn once the session is handed to plugins (`ready`), so what they add always gets it.
const {host, ready, codeBlocks: codeBlockMap, links, markdown, extensions} = useNoteEditor(session, () => props.filePath, () => props.fileId)

// Header tools: the editor's latest state drives their enabled/active looks; each group sits where settings say.
const {effective} = useSettingsScope()
const editorInstance = useTemplateRef<{ view?: MaybeRef<EditorView | undefined> }>('editorInstance')
const editorState = shallowRef<EditorState>()
const stateTracker = EditorView.updateListener.of(update => { editorState.value = update.state })
const editorExtensions = computed(() => [...extensions.value, stateTracker])
const editorView = computed(() => unref(editorInstance.value?.view))
watch(editorView, view => { if (view) editorState.value = view.state }, {immediate: true})
function toolsAt(side: HeaderToolsPosition) {
    const panel = effective.value?.viewConfig.editorPanel
    return (['history', 'format'] as const).filter(tools => (tools === 'history' ? panel?.headerHistory : panel?.headerFormatting) === side)
}

// A link in the note opens its file's tab.
const $navi = useAppNavigator()
const {openTab} = useActiveTabs(session)
async function openLink({referenceId}: InternalLinkClickDetail) {
    if (session?.workspaceSession && referenceId) await $navi.toWorkspaceTab(props.sessionId, openTab(referenceId))
}
// The editor follows no link itself: a web or mail link opens in the default app.
const {openUrlInBrowser} = useAppOpener()
const openExternalLink = ({url}: ExternalLinkClickDetail) => openUrlInBrowser(url)

// The editor's right-click menu (replaces the webview's, so spelling suggestions and Look Up are gone). Tables keep
// their own: their menu takes the event first. Plugins' items (Ask in chat) follow the kernel's, a group per
// registration.
const {t} = useI18n()
const $qt = useQuickToasts()
// The properties panel's suggestions: the workspace's property names and values.
const properties = usePropertiesOptions(session)
const selected = ref('')
const readOnly = computed(() => props.disabled || props.renaming)

function onMenuOpen(open: boolean) {
    const state = editorView.value?.state
    if (open && state) selected.value = state.sliceDoc(state.selection.main.from, state.selection.main.to)
}

/** A failed menu action (clipboard, a plugin's item) shows as a toast. */
const failed = (e: unknown) => $qt.error(t('app.editor.ui.editFailed'), e instanceof Error ? e.message : String(e))

/** Runs a menu action on the editor, then gives it focus back. */
function act(action: (view: EditorView) => unknown) {
    return async () => {
        const view = editorView.value
        if (!view) return
        try {
            await action(view)
        } catch (e) {
            failed(e)
        }
        view.focus()
    }
}

// A plugin's item runs once the menu has closed: closing puts focus back in the editor, which would take it from what
// the item opens (the chat's prompt).
let afterClose: (() => unknown) | null = null
const runAfterClose = (item: PluginMenuItem): ContextMenuItem => {
    const run = item.onSelect
    return {...item, onSelect: run && (() => { afterClose = run }), children: item.children?.map(runAfterClose)}
}
async function onCloseAutoFocus(event: Event) {
    if (!afterClose) return
    event.preventDefault()
    const run = afterClose
    afterClose = null
    try {
        await run()
    } catch (e) {
        failed(e)
    }
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
    const menu = 'app.editor.ui.noteMenu'
    return [
        [
            {label: t(`${menu}.cut`), icon: 'i-lucide-scissors', kbds: ['meta', 'x'], disabled: none || readOnly.value, onSelect: act(async view => {
                await writeText(selected.value)
                view.dispatch({...view.state.replaceSelection(''), userEvent: 'delete.cut'})
            })},
            {label: t(`${menu}.copy`), icon: 'i-lucide-copy', kbds: ['meta', 'c'], disabled: none, onSelect: act(() => writeText(selected.value))},
            {label: t(`${menu}.paste`), icon: 'i-lucide-clipboard-paste', kbds: ['meta', 'v'], disabled: readOnly.value, onSelect: act(paste)},
            {label: t(`${menu}.selectAll`), icon: 'i-lucide-text-select', kbds: ['meta', 'a'], onSelect: act(view => selectAll(view))},
        ],
        ...[...noteMenuItems.items.values()]
            .map(def => def.items({host, selection: selected.value}).map(runAfterClose))
            .filter(group => group.length),
    ]
})
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="vertical"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
    >
        <template #default>
            <UContextMenu :items="menuItems" :content="{ onCloseAutoFocus }" @update:open="onMenuOpen">
                <!-- Frontmatter shows as the editor's own properties panel, offering the workspace's names and values. -->
                <Editor
                    v-if="ready"
                    :disabled="readOnly"
                    :extensions="editorExtensions"
                    ref="editorInstance"
                    v-model="content"
                    class="max-w-2xl w-full"
                    :special-code-block-map="codeBlockMap"
                    :internal-link-map="links"
                    :markdown="markdown"
                    :properties="properties"
                    context-menu-size="sm"
                    @update:model-value="() => contentSaved = false"
                    @internal-link-click="openLink"
                    @external-link-click="openExternalLink"
                />
            </UContextMenu>
        </template>
        <template #header-left>
            <ViewerEditorComponentHeaderTools v-for="tools in toolsAt('left')" :key="tools" :tools="tools" :view="editorView" :state="editorState" :disabled="readOnly"/>
        </template>
        <template #header-right>
            <ViewerEditorComponentHeaderTools v-for="tools in toolsAt('right')" :key="tools" :tools="tools" :view="editorView" :state="editorState" :disabled="readOnly"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>