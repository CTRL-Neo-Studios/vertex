<script setup lang="ts">
import {fileKind, parseCanvas, stringifyCanvas, type JSONCanvas as CanvasDocument} from "@type32/jsoncanvas-editor/core"
import {MESSAGES, type CanvasError, type CanvasMessages, type FileRendererProps, type FileRenderers} from "@type32/jsoncanvas-editor/vue"
import type {InternalLinkClickDetail} from "@type32/codemirror-rich-obsidian-editor"
import type {Component} from "vue"
import type {EditorHost, EmbedDef, EmbedProps, SessionContext} from "#shared/plugin/api"
import {NoteEditor, PluginMount, ViewerLayout} from "~/plugin/ui"
import {useCanvasHost} from "../lib/host"
import {canvasContext} from "../plugin"

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
    session: SessionContext,
    disabled?: boolean,
}>(), {filePath: '', disabled: false})
const emit = defineEmits<{ rename: [oldValue: string, newValue: string] }>()

const {t} = useI18n()
const toast = useToast()
const {session, index, tabs, editor: editors} = props.session
const config = canvasContext().config
const host = useCanvasHost(props.session, () => props.filePath && `${session.rootPath}/${props.filePath}`)
const editor = useTemplateRef<{ refreshFiles: (paths?: string[]) => void }>('editor')

// A card whose file the canvas doesn't draw itself (a `.base`) shows the embed a plugin registered for its type, with
// the canvas as `this`, as a note embeds it. One component per embed, so a card keeps its content while the canvas
// redraws.
const embedHost: EditorHost = {session: props.session, get notePath() { return props.filePath }}
const cards = new WeakMap<EmbedDef, Component<FileRendererProps>>()
function cardFor(def: EmbedDef) {
    let card = cards.get(def)
    if (!card) cards.set(def, card = ({node, file}: FileRendererProps) => h(PluginMount, {
        ui: def,
        props: {filePath: node.file, subpath: node.subpath?.replace(/^#/, ''), assetUrl: file.url ?? '', host: embedHost, card: true} satisfies EmbedProps,
    }))
    return card
}
const fileRenderers: FileRenderers = new Proxy({}, {
    get(_, ext) {
        if (typeof ext !== 'string' || fileKind(`file.${ext}`) !== 'other') return undefined
        const def = editors.embedFor(ext)
        return def && cardFor(def)
    },
})

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

// The plugin's settings; the canvas's own snap switches write there too, as this workspace's.
const snapToGrid = computed({
    get: () => config.value.snapToGrid,
    set: v => void config.set({snapToGrid: v}, 'workspace'),
})
const snapToObjects = computed({
    get: () => config.value.snapToObjects,
    set: v => void config.set({snapToObjects: v}, 'workspace'),
})
const readonly = ref(false)

// The canvas's strings in the app's language. `{file}`-style placeholders are the canvas's to fill, so they're
// handed through as they are.
const messages = computed((): CanvasMessages => Object.fromEntries(Object.entries(MESSAGES).map(([key, english]) => {
    const params = Object.fromEntries([...english.matchAll(/\{(\w+)\}/g)].map(([all, name]) => [name, all]))
    return [key, t(`plugins.canvas.jsonCanvas.${key}`, params)]
})) as CanvasMessages)

function onError({action, error}: CanvasError) {
    toast.add({
        title: t('plugins.canvas.hostFailed', {action}),
        description: error instanceof Error ? error.message : String(error),
        color: 'error',
        icon: 'lucide:circle-alert',
    })
}

function openLink({referenceId}: InternalLinkClickDetail) {
    if (referenceId) void tabs.open(referenceId)
}

// Cards show files from the workspace: when one changes, appears or goes, they load again.
const unsubscribe = index.on((event) => {
    const paths = event.type === 'rename' ? [event.oldPath, event.newPath]
        : event.type === 'remove' ? [event.path, ...event.removedNodes.map(n => n.fullPath)]
            : event.type === 'create' || event.type === 'modify' ? [event.path] : []
    if (paths.length) editor.value?.refreshFiles(paths.map(path => path.slice(session.rootPath!.length + 1)))
})
onBeforeUnmount(unsubscribe)
</script>

<template>
    <ViewerLayout
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
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
                :title="t('plugins.canvas.invalid')"
                :description="t('plugins.canvas.invalidDescription')"
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
                :wheel-behavior="config.value.wheelBehavior"
                :mod-drag-behavior="config.value.modDragBehavior"
                :card-labels="config.value.cardLabels"
                :zoom-breakpoint="config.value.zoomBreakpoint"
                :file-renderers="fileRenderers"
                @error="onError"
            >
                <template #text-editor="{text, update, done}">
                    <NoteEditor :text="text" :note-path="filePath" @update="update" @done="done" @open-link="openLink"/>
                </template>
                <template #note-editor="{text, update, done}">
                    <NoteEditor :text="text" :note-path="filePath" @update="update" @done="done" @open-link="openLink"/>
                </template>
            </JsonCanvas>
        </div>
    </ViewerLayout>
</template>

<style scoped>
/* The canvas runs under the tab's header (h-10); its controls start below it, where they can be clicked. */
.canvas-viewer :deep(.jc-controls) {
    top: calc(2.5rem + 0.75rem);
}
</style>
