<script setup lang="ts">
import type {DropdownMenuItem} from "@nuxt/ui";
import {addView, deleteView, duplicateView, moveView, renameView, setDefaultView, setViewOption, uniqueViewName, viewNameError, type Base} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {useListDrag} from "~/composables/bases/useListDrag";

/**
 * The toolbar's views menu (Obsidian's): switch, reorder and add views, and each view's Configure view page
 * (name, layout, the layout's options, and the ⋯ actions).
 */
const {t} = useI18n()
const ctx = useBaseContext()

const LAYOUT_ICONS: Record<string, string> = {
    table: 'i-lucide-table',
    cards: 'i-lucide-layout-grid',
    list: 'i-lucide-list',
    kanban: 'i-lucide-kanban-square',
    map: 'i-lucide-map',
}
const layoutIcon = (type: string) => LAYOUT_ICONS[type] ?? 'i-lucide-file-question'
const layouts = computed(() => Object.entries(LAYOUT_ICONS).map(([value, icon]) => ({value, icon, label: t(`app.editor.ui.bases.layouts.${value}`)})))

const open = computed({
    get: () => ctx.open.value === 'views' || ctx.open.value === 'addView',
    set: (value: boolean) => {
        ctx.open.value = value ? 'views' : null
    },
})

const query = ref('')
/** The view on the Configure view page; null shows the list. */
const editing = ref<string | null>(null)
/** The Add view form: its view isn't in the file until the form is first committed. */
const draft = ref(false)
const nameText = ref('')

function show(name: string, isDraft = false) {
    editing.value = name
    draft.value = isDraft
    nameText.value = name
}
const startAdd = () => show(uniqueViewName(ctx.base.value, 'View'), true)

watch(() => ctx.open.value, (name, old) => {
    if (name === 'addView') {
        startAdd()
        // Back to `views`, so the command can open the form again.
        ctx.open.value = 'views'
    } else if (name === 'views' && old !== 'addView') {
        query.value = ''
        editing.value = null
        draft.value = false
    }
})

const views = computed(() => ctx.base.value.views ?? [])
const shown = computed(() => {
    const text = query.value.trim().toLowerCase()
    return views.value.map((view, index) => ({view, index})).filter(({view}) => view.name.toLowerCase().includes(text))
})
const edited = computed(() => (draft.value ? {type: 'table', name: editing.value!} : views.value.find(v => v.name === editing.value)))

const {bind, dragging, over} = useListDrag((from, to) => ctx.commit(moveView(ctx.base.value, views.value[from]!.name, to)))

function select(name: string) {
    ctx.viewName.value = name
    open.value = false
}

/** Writes an edit to the configured view; the Add view form creates its view (and switches to it) on its first edit. */
function edit(change: (base: Base, name: string) => Base) {
    if (!draft.value) return ctx.commit(change(ctx.base.value, editing.value!))
    const name = uniqueViewName(ctx.base.value, 'View')
    ctx.commit(change(addView(ctx.base.value, 'table'), name))
    draft.value = false
    editing.value = name
    ctx.viewName.value = name
}

const nameError = computed(() => {
    const error = viewNameError(ctx.base.value, nameText.value.trim(), draft.value ? undefined : editing.value!)
    if (!error) return null
    return t(error.includes('empty') ? 'app.editor.ui.bases.viewNameEmpty' : 'app.editor.ui.bases.viewNameTaken')
})

/** Blur commits a changed name; Enter also commits an untouched Add view form. */
function rename(enter: boolean) {
    const name = nameText.value.trim()
    if (nameError.value || (name === editing.value && !(enter && draft.value))) return
    const active = draft.value || ctx.view.value.name === editing.value
    edit((base, current) => (current === name ? base : renameView(base, current, name)))
    editing.value = name
    nameText.value = name
    if (active) ctx.viewName.value = name
}

function setLayout(type: string) {
    edit((base, name) => setViewOption(base, name, 'type', type))
}

function setOption(key: string, value: unknown) {
    edit((base, name) => setViewOption(base, name, key, value))
}

function duplicate() {
    const name = editing.value!
    const next = duplicateView(ctx.base.value, name)
    // The copy goes right after the original.
    const copy = next.views![views.value.findIndex(v => v.name === name) + 1]!.name
    ctx.commit(next)
    ctx.viewName.value = copy
    show(copy)
}

function remove() {
    const name = editing.value!
    const active = ctx.view.value.name === name
    const next = deleteView(ctx.base.value, name)
    ctx.commit(next)
    if (active) ctx.viewName.value = next.views?.[0]?.name ?? ''
    editing.value = null
}

const actions = computed<DropdownMenuItem[][]>(() => [[
    {
        label: t('app.editor.ui.bases.defaultView'),
        icon: 'i-lucide-layers-2',
        type: 'checkbox',
        checked: views.value[0]?.name === editing.value,
        onUpdateChecked: (checked: boolean) => checked && ctx.commit(setDefaultView(ctx.base.value, editing.value!)),
    },
    {label: t('app.editor.ui.bases.duplicateView'), icon: 'i-lucide-files', onSelect: duplicate},
], [
    {label: t('app.editor.ui.bases.deleteView'), icon: 'i-lucide-trash-2', color: 'error', disabled: views.value.length <= 1, onSelect: remove},
]])
</script>

<template>
    <UPopover v-model:open="open" :content="{align: 'start'}" :ui="{content: 'w-75 p-1'}">
        <UButton size="sm" color="neutral" variant="ghost" :icon="layoutIcon(ctx.view.value.type)" :label="ctx.view.value.name"/>

        <template #content>
            <div v-if="edited">
                <ViewerEditorBasesMenuHeader :title="t('app.editor.ui.bases.configureView')" @back="editing = null" @close="open = false">
                    <template v-if="!draft" #actions>
                        <UDropdownMenu :items="actions" size="sm">
                            <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-more-vertical"/>
                        </UDropdownMenu>
                    </template>
                </ViewerEditorBasesMenuHeader>
                <div class="flex flex-col gap-3 p-2">
                    <UFormField :error="nameError ?? false" size="sm">
                        <UInput
                            v-model="nameText"
                            :placeholder="t('app.editor.ui.bases.viewName')"
                            size="sm"
                            class="w-full"
                            @blur="rename(false)"
                            @keydown.enter="rename(true)"
                        />
                    </UFormField>
                    <UFormField :label="t('app.editor.ui.bases.layout')" size="sm">
                        <USelect
                            :model-value="edited.type"
                            :items="layouts"
                            :icon="layoutIcon(edited.type)"
                            size="sm"
                            class="w-full"
                            @update:model-value="setLayout"
                        />
                    </UFormField>
                    <ViewerEditorBasesViewOptions :view="edited.name" @set="setOption"/>
                </div>
            </div>

            <div v-else>
                <UInput v-model="query" icon="i-lucide-search" :placeholder="t('app.editor.ui.bases.searchPlaceholder')" size="sm" class="w-full mb-1"/>
                <div
                    v-for="{view, index} in shown"
                    :key="view.name"
                    v-bind="bind(index)"
                    class="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm cursor-pointer hover:bg-elevated"
                    :class="{
                        'bg-elevated text-highlighted': view.name === ctx.view.value.name,
                        'ring-1 ring-inset ring-primary': over === index && dragging !== index,
                    }"
                    @click="select(view.name)"
                    @contextmenu.prevent="show(view.name)"
                >
                    <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-dimmed cursor-grab"/>
                    <UIcon :name="layoutIcon(view.type)" class="size-4 shrink-0"/>
                    <span class="grow truncate">{{ view.name }}</span>
                    <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-chevron-right" @click.stop="show(view.name)"/>
                </div>
                <USeparator class="my-1"/>
                <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-plus" :label="t('app.editor.ui.bases.addView')" block class="justify-start" @click="startAdd"/>
            </div>
        </template>
    </UPopover>
</template>
