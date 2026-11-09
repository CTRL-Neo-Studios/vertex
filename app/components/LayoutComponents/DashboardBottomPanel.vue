<script setup lang="ts">
import type {MaybeRefOrGetter, ShallowRef} from "vue";
import {SplitterGroup, SplitterPanel, SplitterResizeHandle} from "reka-ui";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import PanelPane from "~/components/LayoutComponents/PanelPane.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import type {PanelViewAction} from "~/utils/panelViews";

/**
 * The bottom area under the editor: its panes side by side (split by the layout's `split` slots, resized by dragging
 * between them), each with its buttons, name and actions in one row. `collapsed`: just a bar with every pane's buttons,
 * so a view can be opened again from it. Its buttons are always here, whatever the panel style.
 */
defineProps<{ collapsed?: boolean }>()

const {t} = useI18n()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)
const drag = inject(PANEL_DRAG, () => usePanelDrag(panels.move), true)

const state = computed(() => panels.areas.value.bottom)
const kbds = computed(() => panels.kbdsOf('bottom'))
const actionSlots: ShallowRef<MaybeRefOrGetter<PanelViewAction[]> | undefined>[] = []
const actionsOf = (index: number) => (actionSlots[index] ??= shallowRef())
</script>

<template>
    <div :class="['flex flex-col bg-submuted border-t border-default', !collapsed && 'h-full']" data-tauri-drag-region>
        <div v-if="collapsed" class="flex items-center gap-1 h-8 px-2 shrink-0" data-tauri-drag-region>
            <template v-for="(pane, index) in state.panes" :key="index">
                <div v-if="index > 0" class="w-px h-4 mx-1 bg-accented"/>
                <PanelButtons
                    list="bottom"
                    variant="pills"
                    :slots="pane.slots"
                    :end="pane.end"
                    :active="[pane.active]"
                    open
                    :drag
                    :menu="index => panels.slotMenu('bottom', index, pane)"
                    :kbds
                    @select="id => panels.select('bottom', id)"
                />
            </template>
            <div class="grow" data-tauri-drag-region/>
            <UTooltip :text="t('app.panels.expandBottom')" :content="{ side: 'top' }">
                <UButton color="neutral" variant="ghost" size="xs" class="text-muted" icon="i-lucide-panel-bottom-open" :aria-label="t('app.panels.expandBottom')" @click="panels.toggle('bottom')"/>
            </UTooltip>
        </div>
        <!-- Sizes are kept per set of panes (`localStorage`), shared by every window like the side panels'. -->
        <SplitterGroup v-else direction="horizontal" auto-save-id="vertex-panes-bottom" class="flex-1 min-h-0">
            <template v-for="(pane, index) in state.panes" :key="index">
                <SplitterResizeHandle
                    v-if="index > 0"
                    class="relative shrink-0 mx-1 w-px bg-default transition-colors data-[state=hover]:bg-primary data-[state=drag]:bg-primary after:absolute after:inset-y-0 after:-inset-x-1.5 cursor-ew-resize"
                />
                <SplitterPanel :id="`bottom-pane-${index}`" :order="index" :min-size="10" class="px-2">
                    <PanelPane area="bottom" :pane :actions="actionsOf(index)">
                        <template v-if="index === state.panes.length - 1" #trailing>
                            <UTooltip :text="t('app.panels.collapseBottom')" :content="{ side: 'top' }">
                                <UButton color="neutral" variant="ghost" size="xs" class="text-muted" icon="i-lucide-panel-bottom-close" :aria-label="t('app.panels.collapseBottom')" @click="panels.toggle('bottom')"/>
                            </UTooltip>
                        </template>
                    </PanelPane>
                </SplitterPanel>
            </template>
        </SplitterGroup>
    </div>
</template>
