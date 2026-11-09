<script setup lang="ts">
import type {PanelLayout} from "#shared/types/app/settings";
import {isPanelMarker, movePanelSlot, normalizePanelLayout, type PanelList} from "#shared/utils/panelLayout";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import {usePanelDrag} from "~/composables/utility/usePanelDrag";
import {panelSlotMenu, panelViews, withRegisteredViews} from "~/utils/panelViews";

/**
 * Settings → View → Panels: the left and right sides' views (with separators and splits) and the hidden ones, dragged
 * or right-clicked between them. Every registered view is listed; ids that aren't registered keep their place unseen.
 */
const props = defineProps<{ layout: PanelLayout }>()
const emit = defineEmits<{ update: [layout: PanelLayout], reset: [] }>()
const {t} = useI18n()

const layout = computed(() => withRegisteredViews(normalizePanelLayout(props.layout)))
const save = (next: PanelLayout) => emit('update', next)
const drag = usePanelDrag((from, to) => save(movePanelSlot(layout.value, from, to)))

const lists: PanelList[] = ['left', 'right', 'hidden']
const slotsOf = (list: PanelList) => layout.value[list].map((slot, index) => ({slot, index})).filter(s => isPanelMarker(s.slot) || panelViews.has(s.slot))
const menu = (list: PanelList) => (index?: number) =>
    panelSlotMenu({layout: layout.value, list, index, shown: slotsOf(list).map(s => s.index), save, reset: () => emit('reset'), t})
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
