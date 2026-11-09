<script setup lang="ts">
import type {PanelSide} from "#shared/types/app/settings";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";

/**
 * The `strip` style's icon strip at one window edge: its side's views (clicking the shown one collapses its panel),
 * dragged and right-clicked like the buttons. Both strips always show, even empty, so they keep the editor centred:
 * it centres in the space between them and the panels.
 */
const props = defineProps<{ side: PanelSide }>()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)
const drag = inject(PANEL_DRAG, () => usePanelDrag(panels.move), true)
const state = computed(() => panels.areas.value[props.side])
</script>

<template>
    <div
        :class="['w-11 shrink-0 flex flex-col items-center duration-300 transition', side === 'left' ? 'border-e' : 'border-s', !state.open ? 'border-none border-transparent bg-default' : 'bg-submuted border-default']"
        data-tauri-drag-region
    >
        <!-- The header's height: the title bar (and the traffic lights, on the left). -->
        <div class="h-(--ui-header-height) w-full shrink-0" data-tauri-drag-region/>
        <PanelButtons
            :class="['w-full flex-1 pb-2']"
            :list="side"
            variant="strip"
            :slots="state.slots"
            :end="panels.layout.value[side].length"
            :active="state.active"
            :open="state.open"
            :drag
            :menu="index => panels.slotMenu(side, index)"
            @select="id => panels.select(side, id)"
        />
    </div>
</template>
