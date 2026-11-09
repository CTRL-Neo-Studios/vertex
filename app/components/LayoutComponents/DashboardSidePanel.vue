<script setup lang="ts">
import type {PanelSide} from "#shared/types/app/settings";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import WorkspaceSwitcher from "~/components/WorkspaceSwitcher.vue";
import SidebarCollapserButton from "~/components/SidebarCollapserButton.vue";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import {PANEL_ACTIONS, panelViewComponent, panelViews, type PanelViewAction} from "~/utils/panelViews";

/**
 * One side panel (left or right): the view its side shows (see `usePanels`), drawn from the view registry
 * (`app/utils/panelViews.ts`). With the `buttons` style it holds that side's view buttons (a list on the left, icons
 * in the header on the right); with `strip`, the strip at the window's edge does, and the header shows the view's
 * name. The left one's header holds the workspace switcher.
 */
const props = defineProps<{ side: PanelSide }>()

const {t} = useI18n()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)
// One drag state for the window, so a slot can go from one list to another.
const drag = inject(PANEL_DRAG, () => usePanelDrag(panels.move), true)

const state = computed(() => panels.sides.value[props.side])
const strip = computed(() => panels.style.value === 'strip')
const kbds = computed(() => panels.kbdsOf(props.side))
const view = computed(() => (state.value.active ? panelViews.get(state.value.active) : undefined))
const viewComponent = computed(() => panelViewComponent(state.value.active))
const viewLabel = computed(() => (view.value ? t(view.value.label) : ''))

// The shown view's header actions (`usePanelActions`).
const actionsSlot = shallowRef<MaybeRefOrGetter<PanelViewAction[]>>()
provide(PANEL_ACTIONS, actionsSlot)
const actions = computed(() => toValue(actionsSlot.value) ?? [])
// A row under the header with the view's name and actions: always for the left strip style (the name has nowhere
// else to go), otherwise only when there are actions. The left button list already names the view.
const showBar = computed(() => (props.side === 'left' ? strip.value || actions.value.length > 0 : !strip.value && actions.value.length > 0))
const barLabel = computed(() => (props.side === 'left' && !strip.value ? '' : viewLabel.value))

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)
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
            <UDashboardNavbar :toggle="false" :ui="{ root: 'border-none h-(--ui-header-height) px-2 sm:px-2 gap-0 w-full', center: 'flex flex-1 min-w-0 items-center gap-1', left: 'hidden', right: 'hidden' }" data-tauri-drag-region>
                <template v-if="side === 'left'">
                    <!-- The traffic lights; a strip already covers part of them. -->
                    <SpaceOnOs detect-os="macos" :show-on-os="true" :class="strip ? 'w-6' : ''" data-tauri-drag-region/>
                    <WorkspaceSwitcher />
                    <div class="grow" data-tauri-drag-region/>
                    <SidebarCollapserButton v-if="!strip" side="left"/>
                </template>
                <template v-else>
                    <SidebarCollapserButton v-if="!strip" side="right"/>
                    <span v-else class="ps-1 text-sm font-medium text-muted truncate" data-tauri-drag-region>{{ viewLabel }}</span>
                    <div class="grow" data-tauri-drag-region/>
                    <template v-if="strip">
                        <UTooltip v-for="action in actions" :key="action.id" :text="action.label" :content="{ side: 'bottom' }">
                            <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" @click="action.onSelect()"/>
                        </UTooltip>
                    </template>
                    <PanelButtons
                        v-if="!strip"
                        list="right"
                        variant="pills"
                        :slots="state.slots"
                        :end="panels.layout.value.right.length"
                        :active="state.active"
                        open
                        :drag
                        :menu="index => panels.slotMenu('right', index)"
                        :kbds
                        @select="id => panels.select('right', id)"
                    />
                </template>
            </UDashboardNavbar>
            <PanelButtons
                v-if="side === 'left' && !strip"
                class="px-2 pb-2"
                list="left"
                variant="list"
                :slots="state.slots"
                :end="panels.layout.value.left.length"
                :active="state.active"
                open
                :drag
                :menu="index => panels.slotMenu('left', index)"
                :kbds
                @select="id => panels.select('left', id)"
            />
            <div v-if="showBar" class="flex items-center gap-0.5 px-3 pb-1 min-h-7" data-tauri-drag-region>
                <span v-if="barLabel" class="text-xs font-medium text-muted truncate select-none" data-tauri-drag-region>{{ barLabel }}</span>
                <div class="grow" data-tauri-drag-region/>
                <UTooltip v-for="action in actions" :key="action.id" :text="action.label" :content="{ side: 'bottom' }">
                    <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" @click="action.onSelect()"/>
                </UTooltip>
            </div>
        </template>
        <template #default>
            <UScrollArea
                v-if="view?.scroll"
                ref="scrollAreaRef"
                orientation="vertical"
                :class="['no-scrollbar h-full relative scroll-fade', isScrolled && 'is-scrolled']"
                data-tauri-drag-region
            >
                <div class="w-full">
                    <component :is="viewComponent" class="w-full h-full mt-2"/>
                </div>
            </UScrollArea>
            <component :is="viewComponent" v-else-if="viewComponent"/>
        </template>
    </UDashboardSidebar>
</template>
