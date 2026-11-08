<script setup lang="ts">
import type {PanelLayout} from "#shared/types/app/settings";
import {movePanelSlot, normalizePanelLayout, type PanelList} from "#shared/utils/panelLayout";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import {usePanelDrag} from "~/composables/utility/usePanelDrag";
import {panelSlotMenu} from "~/utils/panelViews";

/** Settings → View → Panels: the left and right sides' views (with separators) and the hidden ones, dragged or right-clicked between them. */
const props = defineProps<{ layout: PanelLayout }>()
const emit = defineEmits<{ update: [layout: PanelLayout], reset: [] }>()
const {t} = useI18n()

const layout = computed(() => normalizePanelLayout(props.layout))
const save = (next: PanelLayout) => emit('update', next)
const drag = usePanelDrag((from, to) => save(movePanelSlot(layout.value, from, to)))

const lists: PanelList[] = ['left', 'right', 'hidden']
const slotsOf = (list: PanelList) => layout.value[list].map((slot, index) => ({slot, index}))
const menu = (list: PanelList) => (index?: number) =>
    panelSlotMenu({layout: layout.value, list, index, shown: layout.value[list].map((_, i) => i), save, reset: () => emit('reset'), t})
</script>

<template>
    <div class="grid grid-cols-3 gap-3">
        <div v-for="list in lists" :key="list" class="flex flex-col gap-1.5 min-w-0">
            <span class="text-xs font-medium text-muted">{{ t(`app.panels.lists.${list}`) }}</span>
            <PanelButtons
                class="rounded-md border border-default p-1 min-h-24"
                :list
                variant="list"
                :slots="slotsOf(list)"
                :end="layout[list].length"
                :drag
                :menu="menu(list)"
            />
        </div>
    </div>
</template>
