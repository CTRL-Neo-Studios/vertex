<script setup lang="ts">
import {parseCanvas, stringifyCanvas, type JSONCanvas as CanvasDocument} from "@type32/jsoncanvas-editor/core"
import {MESSAGES, type CanvasError, type CanvasMessages} from "@type32/jsoncanvas-editor/vue"
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types"
import {defaultAppCanvasConfig} from "#shared/utils/defaults/apps"
import {useActiveSessions} from "~/composables/active/useActiveSessions"
import {useActiveTabs} from "~/composables/active/useActiveTabs"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex"
import {useAppNavigator} from "~/composables/app/useAppNavigator"
import {useSettingsScope} from "~/composables/app/useSettingsScope"
import {useCanvasHost} from "~/composables/canvas/useCanvasHost"
import useQuickToasts from "~/composables/utility/useQuickToasts"

/**
 * A `.canvas` file (JSON Canvas, as Obsidian writes it), edited with `@type32/jsoncanvas-editor` (workspace mode
 * only: cards show the workspace's files). The text is parsed once and written back in Obsidian's format after each
 * edit, which the tab autosaves. A file that isn't a canvas shows why and is never overwritten.
 */
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({default: ''})
defineModel<boolean>('contentSaved', {default: false})
const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    sessionId: string,
    internalLinkList?: InternalLink[],
    disabled?: boolean,
}>(), {filePath: '', internalLinkList: () => [], disabled: false})
const emit = defineEmits<{ 'on-rename': [oldValue: string, newValue: string] }>()

const {t} = useI18n()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(props.sessionId)!
const $index = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
const $navi = useAppNavigator()
const scope = useSettingsScope()
const host = useCanvasHost(session, () => props.filePath && `${session.rootPath}/${props.filePath}`)
const editor = useTemplateRef<{ refreshFiles: (paths?: string[]) => void }>('editor')

function read(text: string): { canvas?: CanvasDocument, problem?: string } {
    try {
        return {canvas: parseCanvas(text).canvas}
    } catch (error) {
        return {problem: String(error)}
    }
}

// Text ↔ document. `written` is the last text this viewer produced, so its own saves don't reload it.
let written = content.value
const initial = read(content.value)
const canvas = shallowRef(initial.canvas)
const problem = ref(initial.problem)
watch(canvas, (doc) => {
    if (!doc) return
    const text = stringifyCanvas(doc)
    if (text === content.value) return
    written = text
    content.value = text
})
watch(content, (text) => {
    if (text === written) return
    written = text
    const next = read(text)
    problem.value = next.problem
    if (next.canvas) canvas.value = next.canvas
})

// Settings → View → Canvas; the canvas's own snap switches write there too (this workspace's, in a workspace window).
const config = computed(() => scope.effective.value?.viewConfig.canvas ?? defaultAppCanvasConfig())
const snapToGrid = computed({
    get: () => config.value.snapToGrid,
    set: v => void scope.set({'viewConfig.canvas.snapToGrid': v}),
})
const snapToObjects = computed({
    get: () => config.value.snapToObjects,
    set: v => void scope.set({'viewConfig.canvas.snapToObjects': v}),
})
const readonly = ref(false)

// The canvas's strings in the app's language. `{file}`-style placeholders are the canvas's to fill, so they're
// handed through as they are.
const messages = computed((): CanvasMessages => Object.fromEntries(Object.entries(MESSAGES).map(([key, english]) => {
    const params = Object.fromEntries([...english.matchAll(/\{(\w+)\}/g)].map(([all, name]) => [name, all]))
    return [key, t(`app.editor.ui.jsonCanvas.${key}`, params)]
})) as CanvasMessages)

function onError({action, error}: CanvasError) {
    $qt.error(t('app.editor.ui.canvas.hostFailed', {action}), error instanceof Error ? error.message : String(error))
}

async function openLink({referenceId}: InternalLinkClickDetail) {
    if (referenceId) await $navi.toWorkspaceTab(session.uuid, openTab(referenceId))
}

// Cards show files from the workspace: when one changes, appears or goes, they load again.
const unsubscribe = $index.on((event) => {
    const paths = event.type === 'rename' ? [event.oldPath, event.newPath]
        : event.type === 'remove' ? [event.path, ...event.removedNodes.map(n => n.fullPath)]
            : event.type === 'create' || event.type === 'modify' ? [event.path] : []
    if (paths.length) editor.value?.refreshFiles(paths.map(path => path.slice(session.rootPath!.length + 1)))
})
onBeforeUnmount(unsubscribe)
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :topSpacing="false"
        :bottomSpacing="false"
        :cursorText="false"
    >
        <div v-if="problem || !canvas" class="w-full p-6 pt-12">
            <UAlert
                color="error"
                variant="subtle"
                icon="i-lucide-file-x"
                :title="t('app.editor.ui.canvas.invalid')"
                :description="t('app.editor.ui.canvas.invalidDescription')"
            />
            <p class="mt-3 font-mono text-xs text-muted">{{ problem }}</p>
        </div>
        <!-- Under the header, whose gradient fades the canvas out at the top, as a note fades under it. -->
        <div v-else class="canvas-viewer w-full h-full">
            <JsonCanvas
                ref="editor"
                v-model="canvas"
                v-model:snap-to-grid="snapToGrid"
                v-model:snap-to-objects="snapToObjects"
                v-model:readonly="readonly"
                :host="host"
                :messages="messages"
                :wheel-behavior="config.wheelBehavior"
                :mod-drag-behavior="config.modDragBehavior"
                :card-labels="config.cardLabels"
                :zoom-breakpoint="config.zoomBreakpoint"
                @error="onError"
            >
                <template #text-editor="{text, update, done}">
                    <ViewerEditorComponentCanvasCardEditor :text="text" :internal-link-list="internalLinkList" @update="update" @done="done" @open-link="openLink"/>
                </template>
                <template #note-editor="{text, update, done}">
                    <ViewerEditorComponentCanvasCardEditor :text="text" :internal-link-list="internalLinkList" @update="update" @done="done" @open-link="openLink"/>
                </template>
            </JsonCanvas>
        </div>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>
/* The canvas runs under the tab's header (h-10); its controls start below it, where they can be clicked. */
.canvas-viewer :deep(.jc-controls) {
    top: calc(2.5rem + 0.75rem);
}
</style>
