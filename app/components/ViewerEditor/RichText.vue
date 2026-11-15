<script setup lang="ts">
import type {InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types";
import type {EditorState} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import {selectAll} from "@codemirror/commands";
import {readText, writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {ContextMenuItem} from "@nuxt/ui";
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";
import type {ToTocEntryProps} from "#shared/types/active/events";
import type {HeaderToolsPosition} from "#shared/types/app/settings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveEditorCodeblockMappings} from "~/composables/active/editor/useActiveEditorCodeblockMappings";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import {useActiveEditorExtensions} from "~/composables/active/editor/useActiveEditorExtensions";
import {useInternalLinkList} from "~/composables/active/editor/useInternalLinkList";
import {usePropertiesOptions} from "~/composables/active/editor/usePropertiesOptions";
import {BASE_EMBED} from "~/composables/bases/useBaseContext";
import {useChats} from "~/composables/ai/useChats";
import {aiFeatureOn} from "~/composables/ai/useAiConfig";
import useQuickToasts from "~/composables/utility/useQuickToasts";

/**
 * The kernel's markdown viewer (`.md`, `.txt`): the rich editor, with the outline's line beside it. Two roots (the
 * layout and the outline), so the `ViewerProps` it doesn't declare are dropped rather than given to one of them.
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
const internalLinkList = useInternalLinkList(session)
const codeblockMappings = useActiveEditorCodeblockMappings()
const extensions = useActiveEditorExtensions(session, () => props.fileId)
// Bases embedded in this note (`![[x.base]]`, ` ```base `) query this workspace, with this note as `this`.
if (session?.workspaceSession) provide(BASE_EMBED, {session, thisPath: () => props.filePath})

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

// The outline's jumps and Insert new base arrive through the session's editor dispatcher.
const {dispatcher} = useActiveEditorDispatcher(session)
function toTocEntry({from, verticalScrollStrategy, verticalMargin}: ToTocEntryProps) {
    const view = editorView.value
    if (!view) return
    view.dispatch({selection: {anchor: from}, effects: EditorView.scrollIntoView(from, {y: verticalScrollStrategy ?? 'start', yMargin: verticalMargin ?? 70})})
    view.focus()
}
dispatcher.on('editor.tableOfContents.toEntry', toTocEntry)

/** As Obsidian's "Insert new base": a line break first if the cursor's line has text before it, one after. */
function insertBlock({text}: { text: string }) {
    const view = editorView.value
    if (!view) return
    const {from, to} = view.state.selection.main
    const line = view.state.doc.lineAt(from)
    const insert = `${from > line.from ? '\n' : ''}${text}\n`
    view.dispatch({changes: {from, to, insert}, selection: {anchor: from + insert.length - 1}, scrollIntoView: true})
    view.focus()
}
dispatcher.on('editor.insertBlock', insertBlock)
onBeforeUnmount(dispatcher.unmount)

// The editor's right-click menu (replaces the webview's, so spelling suggestions and Look Up are gone). Tables keep
// their own: their menu takes the event first. Ask in chat needs a workspace (chats belong to one) and Chat on.
const {t} = useI18n()
const $qt = useQuickToasts()
const {root: chatsRoot, askInChat} = useChats(session)
// The properties panel's suggestions: the workspace's property names and values.
const properties = usePropertiesOptions(session)
const selected = ref('')
const readOnly = computed(() => props.disabled || props.renaming)

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
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
    >
        <template #default>
            <UContextMenu :items="menuItems" :content="{ onCloseAutoFocus }" @update:open="onMenuOpen">
                <!-- Frontmatter shows as the editor's own properties panel, offering the workspace's names and values. -->
                <Editor
                    :disabled="readOnly"
                    :extensions="editorExtensions"
                    ref="editorInstance"
                    v-model="content"
                    class="max-w-2xl w-full"
                    :special-code-block-map="codeblockMappings"
                    :internal-link-map="internalLinkList"
                    :properties="properties"
                    context-menu-size="sm"
                    @update:model-value="() => contentSaved = false"
                    @internal-link-click="openLink"
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
    <MinimalLineToc
        class="absolute right-8 top-1/2 -translate-y-1/2 z-10"
        @to-toc="(heading: Heading) => toTocEntry({from: heading.from})"
    />
</template>

<style scoped>

</style>