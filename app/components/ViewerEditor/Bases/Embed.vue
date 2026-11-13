<script setup lang="ts">
import {EditorView} from "@codemirror/view";
import {readTextFile} from "@tauri-apps/plugin-fs";
import type {InternalLink} from "#codemirror-rich-obsidian-editor/editor-types";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {BASE_EMBED} from "~/composables/bases/useBaseContext";

/**
 * A base embedded where Obsidian embeds one, each host passing its own props:
 * - `![[x.base]]` / `![[x.base#View]]` in a note (`linkData`, `subpath`): the file, its edits written to it;
 * - a ` ```base ` block (`codeContent`): the block's YAML, its edits written into the block;
 * - a canvas file card (`node`, its `subpath` `#View`): the file, filling the card.
 * `this` is the tab's file (the note or the canvas), from `BASE_EMBED`; without it (no workspace) nothing shows.
 *
 * The editor unmounts embeds scrolled out of view and remounts them on the way back (and a block after each edit it
 * writes), so what must survive lives in `useState`: the shown view per embed, and each file's last text, which lets a
 * remount draw at its full height at once instead of collapsing while the file is read.
 */
defineOptions({inheritAttrs: false})
const props = defineProps<{
    linkData?: InternalLink,
    subpath?: string,
    codeContent?: string,
    node?: { id: string, file: string, subpath?: string },
}>()

const {t} = useI18n()
const embed = inject(BASE_EMBED, null)
const $index = embed ? useActiveWorkspaceIndex(embed.session) : null
const tools = embed ? useActiveWorkspaceTools(embed.session) : null
const root = useTemplateRef<HTMLElement>('root')

const inBlock = props.codeContent !== undefined
const file = computed(() => {
    if (!$index || !embed) return undefined
    if (props.linkData) return $index.getFileByUuid(props.linkData.referenceId)
    return props.node ? $index.getFileByPath(`${embed.session.rootPath}/${props.node.file}`) : undefined
})

const texts = useState<Record<string, string>>('bases-embed-texts', () => ({}))
const text = ref<string | null>(inBlock ? props.codeContent! : texts.value[file.value?.fullPath ?? ''] ?? null)

// A file's text, read again when it changes on disk or in its tab.
async function load() {
    const path = file.value?.fullPath
    if (path) text.value = texts.value[path] = await readTextFile(path)
}
if (!inBlock) {
    watch(() => file.value?.fullPath, load, {immediate: true})
    const unsubscribe = $index?.on((event) => {
        if (event.type === 'modify' && event.path === file.value?.fullPath) void load()
    })
    onBeforeUnmount(() => unsubscribe?.())
}

// The shown view, by embed: a link by its target and subpath, a card by its id, a block by its text (moved to the new
// text when the block is written).
// ponytail: identical blocks (or links) in one note share their view; key by position if that ever matters.
const views = useState<Record<string, string>>('bases-embed-views', () => ({}))
const viewKey = computed(() => {
    const here = embed?.thisPath() ?? ''
    if (inBlock) return `${here}\n${text.value}`
    return props.node ? `${here}#${props.node.id}` : `${here}#${props.linkData?.referenceId}#${props.subpath ?? ''}`
})
const view = ref(views.value[viewKey.value] ?? props.subpath ?? props.node?.subpath?.replace(/^#/, '') ?? '')
watch(view, name => views.value[viewKey.value] = name)

/** The block's editor and the position of its opening fence. */
function blockPlace() {
    const widget = root.value?.closest<HTMLElement>('.vue-embed-widget')
    const editor = widget?.closest<HTMLElement>('.cm-editor')
    const cm = editor ? EditorView.findFromDOM(editor) : null
    return cm && widget ? {cm, pos: cm.posAtDOM(widget)} : null
}

/** Replaces the block's YAML, as Obsidian does: the base's text, then a blank line before the closing fence. */
function writeBlock(next: string) {
    const place = blockPlace()
    if (!place) return
    const {cm, pos} = place, doc = cm.state.doc
    const open = doc.lineAt(pos)
    const fence = /^\s*(`{3,}|~{3,})/.exec(open.text)?.[1]
    if (!fence) return
    for (let n = open.number + 1; n <= doc.lines; n++) {
        const line = doc.line(n)
        if (line.text.trim().startsWith(fence) && /^\s*[`~]+\s*$/.test(line.text)) {
            cm.dispatch({changes: {from: doc.line(open.number + 1).from, to: line.from, insert: `${next}\n`}})
            return
        }
    }
}

// Writing a block redraws it (a new embed), so it waits for the edit's handler to finish, which may still switch the
// view; edits in the same tick go in one write, and the view goes with the new text.
let pending: string | null = null
async function save(next: string) {
    text.value = next
    if (inBlock) {
        if (pending === null) void nextTick(() => {
            views.value[viewKey.value] = view.value
            writeBlock(pending!)
            pending = null
        })
        pending = next
        return
    }
    if (file.value && tools) await tools.editNotes([{uuid: file.value.uuid, text: next}], t('app.editor.ui.bases.editStep', {name: file.value.fileName}, 1))
}
</script>

<template>
    <!-- `contain: inline-size`: wide layouts (a kanban's columns) scroll inside rather than widening the note. -->
    <div
        v-if="embed && text !== null"
        ref="root"
        class="flex flex-col text-sm [contain:inline-size]"
        :class="node ? 'h-full' : 'my-2 rounded-lg border border-default overflow-hidden bg-default'"
    >
        <ViewerEditorBasesBase
            :model-value="text"
            v-model:view="view"
            :session="embed.session"
            :this-path="embed.thisPath()"
            :embed="node ? 'card' : 'note'"
            @update:model-value="save"
        />
    </div>
</template>
