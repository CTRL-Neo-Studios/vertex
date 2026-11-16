<script setup lang="ts">
import {toFilterGroup} from "@type32/obsidian-bases-parser";
import {NoteEditor} from "~/plugin/ui";
import {useBaseContext} from "../lib/useBaseContext";
import {newItemFolder, newItemFrontmatter} from "../lib/basesNewItem";

/**
 * Obsidian's toolbar New: creates "Untitled.md" with frontmatter matching the simple filters and the view's properties
 * (plus a kanban column's value, `ctx.newItemPreset`), in the folder a `file.inFolder` filter names, else next to the
 * base, and edits it in a popover on the button. Opening the menu (the button, a command, a kanban column) creates it.
 */
const {t} = useI18n()
const ctx = useBaseContext()
const {index, files} = ctx.session
const toast = useToast()

const open = computed({
    get: () => ctx.open.value === 'new',
    set: value => ctx.open.value = value ? 'new' : null,
})
const note = ref<{ uuid: string, path: string, title: string, text: string }>()

async function create() {
    const root = ctx.session.session.rootPath
    if (!root) return
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
        const dir = folder === '/' ? '' : folder
        const untitled = t('plugins.bases.untitled')
        let title = untitled
        for (let i = 1; index.byPath(`${root}/${dir ? `${dir}/` : ''}${title}.md`); i++) title = `${untitled} ${i}`
        const entry = await files.create(dir, `${title}.md`)
        if (!entry) return
        if (text) await files.write(entry.uuid, text)
        note.value = {uuid: entry.uuid, path: entry.relativePath, title, text}
    } catch (error) {
        open.value = false
        toast.add({title: t('plugins.bases.createFailed'), description: String(error), color: 'error', icon: 'lucide:circle-alert'})
    }
}

// Edits are written once typing pauses, and right away when the popover closes.
let pending: string | undefined
function flush() {
    if (note.value && pending !== undefined) void files.write(note.value.uuid, pending)
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
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('plugins.bases.new')"/>
        <template #content>
            <div class="w-[400px] h-[300px] flex flex-col">
                <template v-if="note">
                    <div class="px-4 pt-3 font-semibold truncate">{{ note.title }}</div>
                    <div class="grow min-h-0">
                        <NoteEditor
                            :text="note.text"
                            :note-path="note.path"
                            @update="update"
                            @done="open = false"
                        />
                    </div>
                </template>
            </div>
        </template>
    </UPopover>
</template>
