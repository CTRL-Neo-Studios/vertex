<script setup lang="ts">
import {setOrder} from "@type32/obsidian-bases-parser";
import {bareId, useBaseContext, type BaseProperty} from "~/composables/bases/useBaseContext";
import {moved, useListDrag} from "~/composables/bases/useListDrag";

/**
 * Obsidian's Properties menu: the view's shown properties (checked, in `order`, draggable), then the hidden ones;
 * each opens its page (display name, formula). Also creates properties and formulas.
 */
const {t} = useI18n()
const ctx = useBaseContext()

const open = computed({
    get: () => ctx.open.value === 'properties',
    set: (value) => {
        if (value) ctx.open.value = 'properties'
        else if (ctx.open.value === 'properties') ctx.open.value = null
    },
})
const query = ref('')
/** The property whose page is shown. */
const editing = ref<string | null>(null)
const adding = ref(false)
// Opening starts on the list, or on the page "Edit property…" asked for (`ctx.propertyPage`).
watch(open, (value) => {
    if (!value) return
    query.value = ''
    editing.value = ctx.propertyPage.value === null ? null : bareId(ctx.propertyPage.value)
    ctx.propertyPage.value = null
    adding.value = false
})

const order = computed(() => ctx.view.value.order ?? ['file.name'])
const write = (next: string[]) => ctx.commit(setOrder(ctx.base.value, ctx.view.value.name, next))

interface Row { property: BaseProperty, index: number }
const shown = computed<Row[]>(() => order.value.map((id, index) => ({property: ctx.property(id), index})))
const hidden = computed<Row[]>(() => {
    const ids = new Set(shown.value.map(r => r.property.id))
    const rest = ctx.properties.value.filter(p => !ids.has(p.id))
    const files = rest.filter(p => p.source === 'file').sort((a, b) => a.id.localeCompare(b.id))
    return [...files, ...rest.filter(p => p.source !== 'file')].map(property => ({property, index: -1}))
})
const matches = (p: BaseProperty) => {
    const q = query.value.trim().toLowerCase()
    return !q || p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
}
const rows = computed(() => [...shown.value, ...hidden.value].filter(r => matches(r.property)))
const creatable = computed(() => {
    const name = query.value.trim()
    return name && ![...shown.value, ...hidden.value].some(r => r.property.id === name || r.property.label === name) ? name : null
})

const isShown = (id: string) => order.value.some(o => ctx.property(o).id === id)
function toggle(id: string) {
    write(isShown(id) ? order.value.filter(o => ctx.property(o).id !== id) : [...order.value, id])
}
function addProperty() {
    if (creatable.value) write([...order.value, bareId(creatable.value)])
    query.value = ''
}

const {bind, over} = useListDrag((from, to) => write(moved(order.value, from, to)))
</script>

<template>
    <UPopover v-model:open="open" :content="{align: 'end'}">
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-list" :label="t('app.editor.ui.bases.properties')"/>
        <template #content>
            <div class="w-75 p-1 text-sm">
                <ViewerEditorBasesPropertyPage
                    v-if="editing"
                    :key="editing"
                    :id="editing"
                    :shown="isShown(editing)"
                    @toggle="toggle"
                    @back="editing = null"
                    @close="open = false"
                />
                <ViewerEditorBasesFormulaPage v-else-if="adding" @back="adding = false" @close="open = false"/>
                <template v-else>
                    <UInput v-model="query" :placeholder="t('app.editor.ui.bases.findOrCreate')" icon="i-lucide-search" size="sm" variant="subtle" class="w-full mb-1" autofocus/>
                    <!-- WebKit's overlay scrollbar takes clicks over the row ends: keep the chevrons clear of it. -->
                    <div class="max-h-80 overflow-y-auto pe-3">
                        <div
                            v-for="row in rows"
                            :key="row.property.id"
                            v-bind="row.index >= 0 ? bind(row.index) : {}"
                            class="flex items-center gap-1.5 px-1 py-0.5 rounded-md hover:bg-elevated/50"
                            :class="row.index >= 0 && over === row.index ? 'bg-elevated' : ''"
                        >
                            <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-dimmed" :class="row.index >= 0 ? 'cursor-grab' : 'invisible'"/>
                            <label class="flex grow min-w-0 items-center gap-1.5 cursor-pointer">
                                <UCheckbox :model-value="row.index >= 0" @update:model-value="toggle(row.property.id)"/>
                                <UIcon :name="row.property.icon" class="size-4 shrink-0 text-muted"/>
                                <span class="truncate">{{ row.property.label }}</span>
                            </label>
                            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" @click="editing = row.property.id"/>
                        </div>
                    </div>
                    <UButton
                        v-if="creatable"
                        size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" block class="justify-start"
                        :label="t('app.editor.ui.bases.addProperty', {name: creatable})"
                        @click="addProperty"
                    />
                    <USeparator class="my-1"/>
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-square-function" block class="justify-start" :label="t('app.editor.ui.bases.addFormula')" @click="adding = true"/>
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-eye-off" block class="justify-start" :label="t('app.editor.ui.bases.hideAll')" @click="write([])"/>
                </template>
            </div>
        </template>
    </UPopover>
</template>
