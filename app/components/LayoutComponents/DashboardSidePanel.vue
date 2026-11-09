<script setup lang="ts">
import type {MaybeRefOrGetter, ShallowRef} from "vue";
import {SplitterGroup, SplitterPanel, SplitterResizeHandle} from "reka-ui";
import type {PanelSide} from "#shared/types/app/settings";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import WorkspaceSwitcher from "~/components/WorkspaceSwitcher.vue";
import SidebarCollapserButton from "~/components/SidebarCollapserButton.vue";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import PanelPane from "~/components/LayoutComponents/PanelPane.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import {panelViews, type PanelViewAction} from "~/utils/panelViews";

/**
 * One side panel (left or right): its panes stacked (split by the layout's `split` slots, resized by dragging between
 * them), each showing one view from the registry (`app/utils/panelViews.ts`, see `PanelPane`). The left one's header
 * holds the workspace switcher; the right one's holds its first pane's buttons (or, with `strip`, its name and actions).
 */
const props = defineProps<{ side: PanelSide }>()

const {t} = useI18n()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)
// One drag state for the window, so a slot can go from one list to another.
const drag = inject(PANEL_DRAG, () => usePanelDrag(panels.move), true)

const state = computed(() => panels.areas.value[props.side])
const strip = computed(() => panels.style.value === 'strip')
const kbds = computed(() => panels.kbdsOf(props.side))

// Each pane's slot for its view's header actions, by position; owned here so the header can draw the first pane's.
const actionSlots: ShallowRef<MaybeRefOrGetter<PanelViewAction[]> | undefined>[] = []
const actionsOf = (index: number) => (actionSlots[index] ??= shallowRef())
const first = computed(() => state.value.panes[0])
const firstActions = computed(() => toValue(actionsOf(0).value) ?? [])
const firstLabel = computed(() => {
    const view = first.value && panelViews.get(first.value.active)
    return view ? t(view.label) : ''
})
</script>

<template>
    <!-- UDashboardSidebar, not UDashboardPanel: a panel goes full-width below `lg`. `root: flex` undoes the sidebar's
    own `hidden lg:flex`; without a toggle its mobile menu never opens. Not `collapsible`: the collapsed state is ours.
    `id` keeps its resized width (Nuxt UI's cookie) the same in every window. -->
    <UDashboardSidebar
        v-if="state.open"
        :id="side"
        :side
        data-tauri-drag-region
        :min-size="12"
        :max-size="30"
        :default-size="18"
        :toggle="false"
        resizable
        :ui="{ root: 'flex bg-submuted', header: 'contents', body: 'px-2 py-0 gap-0' }"
    >
        <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
            <UDashboardResizeHandle
                :class="['block after:absolute after:inset-y-0 after:w-px hover:after:cursor-ew-resize after:cursor-ew-resize cursor-ew-resize hover:after:bg-primary transition-all duration-300 after:transition-all after:duration-300', side === 'left' ? 'after:right-0' : 'after:left-0']"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <!-- `deep`: Tauri drags from anywhere inside, the navbar's own slot wrappers and gaps too (it can't mark
            those); buttons and other controls still click. -->
            <UDashboardNavbar :toggle="false" :ui="{ root: 'border-none h-(--ui-header-height) px-2 sm:px-2 gap-0 w-full', center: 'flex flex-1 min-w-0 items-center gap-1', left: 'hidden', right: 'hidden' }" data-tauri-drag-region="deep">
                <template v-if="side === 'left'">
                    <!-- The traffic lights; a strip already covers part of them. -->
                    <SpaceOnOs detect-os="macos" :show-on-os="true" :class="strip ? 'w-6' : ''"/>
                    <WorkspaceSwitcher />
                    <div class="grow"/>
                    <SidebarCollapserButton v-if="!strip" side="left"/>
                </template>
                <template v-else-if="first">
                    <SidebarCollapserButton v-if="!strip" side="right"/>
                    <span v-else class="ps-1 text-sm font-medium text-muted truncate">{{ firstLabel }}</span>
                    <div class="grow"/>
                    <template v-if="strip">
                        <UTooltip v-for="action in firstActions" :key="action.id" :text="action.label" :content="{ side: 'bottom' }">
                            <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" @click="action.onSelect()"/>
                        </UTooltip>
                    </template>
                    <PanelButtons
                        v-else
                        list="right"
                        variant="pills"
                        :slots="first.slots"
                        :end="first.end"
                        :active="[first.active]"
                        open
                        :drag
                        :menu="index => panels.slotMenu('right', index, first)"
                        :kbds
                        @select="id => panels.select('right', id)"
                    />
                </template>
            </UDashboardNavbar>
        </template>
        <template #default>
            <!-- Sizes are kept per side and set of panes (`localStorage`), shared by every window like the widths. -->
            <SplitterGroup direction="vertical" :auto-save-id="`vertex-panes-${side}`" class="flex-1 min-h-0">
                <template v-for="(pane, index) in state.panes" :key="index">
                    <SplitterResizeHandle
                        v-if="index > 0"
                        class="relative shrink-0 my-1 h-px bg-default transition-colors data-[state=hover]:bg-primary data-[state=drag]:bg-primary after:absolute after:inset-x-0 after:-inset-y-1.5 cursor-ns-resize"
                    />
                    <SplitterPanel :id="`${side}-pane-${index}`" :order="index" :min-size="10">
                        <PanelPane :area="side" :pane :actions="actionsOf(index)" :in-header="side === 'right' && index === 0"/>
                    </SplitterPanel>
                </template>
            </SplitterGroup>
        </template>
    </UDashboardSidebar>
</template>
