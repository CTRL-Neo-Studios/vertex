<script setup lang="ts">
import type {MaybeRefOrGetter, ShallowRef} from "vue";
import type {PanelArea} from "#shared/types/app/settings";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels, type PanelPaneState} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import {useScrollFade} from "~/composables/utility/useScrollFade";
import {PANEL_ACTIONS, panelViewComponent, panelViews, type PanelViewAction} from "~/utils/panelViews";

/**
 * One pane of a panel: its view buttons, a row with the view's name and header actions, and the view. On a side: a
 * list on the left, pills on the right (the strips hold them in the `strip` style), and the right side's first pane
 * has its buttons, name and actions in the panel's header instead (`inHeader`), drawn by `DashboardSidePanel`. At the
 * bottom: one compact row with the pills, name, actions and `#trailing` (the area's collapse button), in every style.
 */
const props = defineProps<{
    area: PanelArea
    pane: PanelPaneState
    /** This pane's slot for its view's `usePanelActions`; the panel owns it, so its header can draw them too. */
    actions: ShallowRef<MaybeRefOrGetter<PanelViewAction[]> | undefined>
    inHeader?: boolean
}>()

const {t} = useI18n()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)
const drag = inject(PANEL_DRAG, () => usePanelDrag(panels.move), true)
provide(PANEL_ACTIONS, props.actions)

const strip = computed(() => panels.style.value === 'strip')
const kbds = computed(() => panels.kbdsOf(props.area))
const view = computed(() => panelViews.get(props.pane.active))
const viewComponent = computed(() => panelViewComponent(props.pane.active))
const actions = computed(() => toValue(props.actions.value) ?? [])
// Strip: the name always (the strips hold no names). Buttons: only while there are actions, and the name only on the
// right (the left list already names the view).
const showBar = computed(() => (strip.value ? !props.inHeader : actions.value.length > 0))
const barLabel = computed(() => (strip.value || props.area === 'right') && view.value ? t(view.value.label) : '')

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const fade = useScrollFade(() => scrollAreaRef.value?.$el)
</script>

<template>
    <div class="h-full min-h-0 flex flex-col" data-tauri-drag-region>
        <div v-if="area === 'bottom'" class="flex items-center gap-1 h-8 shrink-0" data-tauri-drag-region>
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
            <span v-if="view" class="ps-1 text-xs font-medium text-muted truncate select-none" data-tauri-drag-region>{{ t(view.label) }}</span>
            <div class="grow" data-tauri-drag-region/>
            <UTooltip v-for="action in actions" :key="action.id" :text="action.label" :content="{ side: 'top' }">
                <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" @click="action.onSelect()"/>
            </UTooltip>
            <slot name="trailing"/>
        </div>
        <template v-else-if="!strip">
            <PanelButtons
                v-if="area === 'left'"
                class="pb-2"
                list="left"
                variant="list"
                :slots="pane.slots"
                :end="pane.end"
                :active="[pane.active]"
                open
                :drag
                :menu="index => panels.slotMenu('left', index, pane)"
                :kbds
                @select="id => panels.select('left', id)"
            />
            <div v-else-if="!inHeader" class="flex items-center pb-1" data-tauri-drag-region>
                <div class="grow" data-tauri-drag-region/>
                <PanelButtons
                    list="right"
                    variant="pills"
                    :slots="pane.slots"
                    :end="pane.end"
                    :active="[pane.active]"
                    open
                    :drag
                    :menu="index => panels.slotMenu('right', index, pane)"
                    :kbds
                    @select="id => panels.select('right', id)"
                />
            </div>
        </template>
        <div v-if="area !== 'bottom' && showBar" class="flex items-center gap-0.5 px-1 pb-1 min-h-7" data-tauri-drag-region>
            <span v-if="barLabel" class="text-xs font-medium text-muted truncate select-none" data-tauri-drag-region>{{ barLabel }}</span>
            <div class="grow" data-tauri-drag-region/>
            <UTooltip v-for="action in actions" :key="action.id" :text="action.label" :content="{ side: 'bottom' }">
                <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" @click="action.onSelect()"/>
            </UTooltip>
        </div>
        <!-- The view's box: views size themselves to it (`h-full`, `flex-1`). -->
        <div class="relative flex-1 min-h-0 flex flex-col">
            <UScrollArea
                v-if="view?.scroll"
                ref="scrollAreaRef"
                orientation="vertical"
                :class="['no-scrollbar h-full relative', fade]"
                data-tauri-drag-region
            >
                <div class="w-full">
                    <component :is="viewComponent" class="w-full h-full mt-2"/>
                </div>
            </UScrollArea>
            <component :is="viewComponent" v-else-if="viewComponent"/>
        </div>
    </div>
</template>
