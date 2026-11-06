import type {EditorState, Extension} from "@codemirror/state";
import {ViewPlugin, type EditorView} from "@codemirror/view";
import {editorLabels, headingAt, headingsField, type Heading} from "@type32/codemirror-rich-obsidian-editor/kit";
import {blockDragHandle, selectionToolbar, slashMenu} from "@type32/codemirror-rich-obsidian-editor/ext";
import type {ActiveSession} from "#shared/types/active/sessions";
import {sessionScope, StateKey} from "#shared/constants/app";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useAiEditorExtension} from "~/composables/ai/useAiEditorExtension";

// Plugins must be stable objects (package README), so they are built once and only picked per settings.
const toolbarExt = selectionToolbar()
const slashExt = slashMenu()
const blockHandleExt = blockDragHandle()

/** Editor package label keys (its README, "Labels / localization"); each maps to `app.editor.labels.<key>`. */
const LABEL_KEYS = [
    'bold', 'italic', 'strikethrough', 'highlight', 'link', 'wikilink', 'paragraph', 'heading1', 'heading2', 'heading3',
    'bulletList', 'orderedList', 'taskList', 'quote', 'callout', 'codeBlock', 'mathBlock', 'table', 'divider',
    'moveUp', 'moveDown', 'delete', 'askAi',
    'improve', 'fix', 'shorten', 'expand', 'simplify', 'continue', 'outline', 'brainstorm',
    'ui.blockHandle', 'ui.linkPlaceholder', 'ui.linkApply', 'ui.linkRemove',
    'ui.ai.suggestedEdit', 'ui.ai.suggestedInsertion', 'ui.ai.count', 'ui.ai.thinking', 'ui.ai.stale', 'ui.ai.staleTool',
    'ui.ai.instructionPlaceholder', 'ui.ai.refinePlaceholder', 'ui.ai.accept', 'ui.ai.discard', 'ui.ai.retry',
    'ui.ai.stop', 'ui.ai.edit', 'ui.ai.done', 'ui.ai.copy', 'ui.ai.insertBelow',
] as const

function outlineKeys(session: ActiveSession | undefined, tabId: string) {
    const scope = sessionScope(session, 'useActiveEditorExtensions')
    return {outline: StateKey.tabOutline(scope, tabId), activeHeading: StateKey.tabActiveHeading(scope, tabId)}
}

/** Mounted markdown editors by `${scope}:${tabId}`; a view isn't serializable, so it lives here and not in `useState`. */
const views = new Map<string, EditorView>()

/** The tab's markdown editor while it's mounted (its tab is the one shown), else `undefined`. */
export function editorViewOf(session: ActiveSession | undefined, tabId: string | null | undefined) {
    return tabId ? views.get(`${sessionScope(session, 'editorViewOf')}:${tabId}`) : undefined
}

/** Read-only outline of a tab's markdown editor and the `from` of the heading containing the cursor; follows `tabId`. */
export function useTabOutline(session: ActiveSession | undefined, tabId: MaybeRefOrGetter<string>) {
    const nuxtApp = useNuxtApp()
    const keys = computed(() => outlineKeys(session, toValue(tabId)))
    return {
        // `runWithContext` is typed as possibly async; `useState` is sync.
        outline: computed(() => (nuxtApp.runWithContext(() => useState<Heading[]>(keys.value.outline, () => [])) as Ref<Heading[]>).value),
        activeHeading: computed(() => (nuxtApp.runWithContext(() => useState<number | null>(keys.value.activeHeading, () => null)) as Ref<number | null>).value),
    }
}

/** CodeMirror extensions for a tab's markdown editor: outline tracking plus the optional ready-made UI extensions. */
export function useActiveEditorExtensions(session: ActiveSession | undefined, tabId: MaybeRefOrGetter<string>) {
    const keys = outlineKeys(session, toValue(tabId))
    const outline = useState<Heading[]>(keys.outline, () => [])
    const activeHeading = useState<number | null>(keys.activeHeading, () => null)
    const {effective} = useSettingsScope()
    const {t, locale} = useI18n()
    const ai = useAiEditorExtension()
    // `{n}`/`{total}` are the package's own placeholders: pass them through vue-i18n untouched.
    const labels = computed(() => {
        void locale.value
        return editorLabels.of(Object.fromEntries(LABEL_KEYS.map(k => [k, t(`app.editor.labels.${k}`, {n: '{n}', total: '{total}'})])))
    })

    let lastHeadings: Heading[] | undefined
    function sync(state: EditorState) {
        const list = state.field(headingsField)
        if (list !== lastHeadings) outline.value = lastHeadings = list
        const from = headingAt(state, state.selection.main.head)?.from ?? null
        if (from !== activeHeading.value) activeHeading.value = from
    }
    // A view plugin rather than an update listener so the outline is also written when the view is created.
    const viewKey = `${sessionScope(session, 'useActiveEditorExtensions')}:${toValue(tabId)}`
    const tracker = ViewPlugin.define(view => {
        views.set(viewKey, view)
        sync(view.state)
        return {
            update: u => sync(u.state),
            destroy: () => { if (views.get(viewKey) === view) views.delete(viewKey) },
        }
    })
    return computed<Extension[]>(() => {
        const panel = effective.value?.viewConfig.editorPanel
        return [
            labels.value,
            headingsField,
            tracker,
            panel?.selectionToolbar ?? true ? toolbarExt : [],
            panel?.slashMenu ?? true ? slashExt : [],
            panel?.blockHandle ?? true ? blockHandleExt : [],
            ai.value,
        ]
    })
}
