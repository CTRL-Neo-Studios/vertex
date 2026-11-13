<script setup lang="ts">
import {toFilterGroup} from "@type32/obsidian-bases-parser";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {newItemFolder, newItemFrontmatter} from "~/utils/basesNewItem";

/**
 * Obsidian's toolbar New: creates "Untitled.md" with frontmatter matching the simple filters and the view's properties
 * (plus a kanban column's value, `ctx.newItemPreset`), in the folder a `file.inFolder` filter names, else next to the
 * base, and edits it in a popover on the button. Opening the menu (the button, a command, a kanban column) creates it.
 */
const {t} = useI18n()
const ctx = useBaseContext()
const tools = useActiveWorkspaceTools(ctx.session)
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)
const $qt = useQuickToasts()

const open = computed({
    get: () => ctx.open.value === 'new',
    set: value => ctx.open.value = value ? 'new' : null,
})
const note = ref<{ uuid: string, title: string, text: string }>()

async function create() {
    if (!ctx.session.rootPath) return
    const kindOf = (id: string) => ctx.property(id).kind
    const groups = [toFilterGroup(ctx.base.value.filters, kindOf), toFilterGroup(ctx.view.value.filters, kindOf)]
    const preset = ctx.newItemPreset.value
    ctx.newItemPreset.value = null
    // A kanban grouped by folder gives the note its folder rather than a property.
    const presetFolder = preset?.key === 'file.folder' ? String(preset.value ?? '') : null
    const text = newItemFrontmatter(groups, kindOf, {order: ctx.view.value.order, set: preset && presetFolder === null ? preset : undefined})
    try {
        const slash = ctx.thisPath.lastIndexOf('/')
        const folder = presetFolder ?? newItemFolder(groups) ?? (slash < 0 ? '' : ctx.thisPath.slice(0, slash))
        const dir = await tools.ensureFolder(folder === '/' ? '' : folder)
        const untitled = t('app.editor.ui.bases.untitled')
        let title = untitled
        for (let i = 1; getFileByPath(`${dir}/${title}.md`); i++) title = `${untitled} ${i}`
        const entry = await tools.createFile(getFileByPath(dir)?.uuid, `${title}.md`, false, 'below')
        if (!entry) return
        if (text) await tools.saveContent(entry.uuid, text)
        note.value = {uuid: entry.uuid, title, text}
    } catch (error) {
        open.value = false
        $qt.error(t('app.home.createFailed'), String(error))
    }
}

// Edits are written once typing pauses, and right away when the popover closes.
let pending: string | undefined
function flush() {
    if (note.value && pending !== undefined) void tools.saveContent(note.value.uuid, pending)
    pending = undefined
}
const saveSoon = useDebounceFn(flush, 500)
function update(text: string) {
    note.value!.text = pending = text
    void saveSoon()
}

watch(open, (isOpen) => {
    if (isOpen) {
        void create()
        return
    }
    flush()
    note.value = undefined
})
onBeforeUnmount(flush)
</script>

<template>
    <UPopover v-model:open="open">
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('app.editor.ui.bases.new')"/>
        <template #content>
            <div class="w-[400px] h-[300px] flex flex-col">
                <template v-if="note">
                    <div class="px-4 pt-3 font-semibold truncate">{{ note.title }}</div>
                    <div class="grow min-h-0">
                        <ViewerEditorComponentCanvasCardEditor
                            :text="note.text"
                            :internal-link-list="[]"
                            @update="update"
                            @done="open = false"
                        />
                    </div>
                </template>
            </div>
        </template>
    </UPopover>
</template>
