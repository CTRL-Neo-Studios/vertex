<script setup lang="ts">
import type {MaybeRefOrGetter, ShallowRef} from "vue";
import {SplitterGroup, SplitterPanel, SplitterResizeHandle} from "reka-ui";
import PanelPane from "~/components/LayoutComponents/PanelPane.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import type {PanelViewAction} from "~/utils/panelViews";

/**
 * The bottom area under the editor, while it's open: its panes side by side (split by the layout's `split` slots,
 * resized by dragging between them), each with its buttons (In the panels), name and actions in one row; the last row
 * ends with the collapse button. Collapsed, it isn't drawn at all (`DashboardCenterPanel`).
 */
const {t} = useI18n()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)

const state = computed(() => panels.areas.value.bottom)
const actionSlots: ShallowRef<MaybeRefOrGetter<PanelViewAction[]> | undefined>[] = []
const actionsOf = (index: number) => (actionSlots[index] ??= shallowRef())
</script>

<template>
    <!-- Sizes are kept per set of panes (`localStorage`), shared by every window like the side panels'. -->
    <SplitterGroup direction="horizontal" auto-save-id="vertex-panes-bottom" class="h-full bg-submuted border-t border-default" data-tauri-drag-region>
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
</template>
