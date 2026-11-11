<script setup lang="ts">
import type {ContextMenuItem} from "@nuxt/ui";
import type {PanelSlot, PanelViewId} from "#shared/types/app/settings";
import type {PanelList} from "#shared/utils/panelLayout";
import type {PanelDrag} from "~/composables/utility/usePanelDrag";
import {panelViews} from "~/utils/panelViews";

/**
 * One list of panel view buttons, in one of three looks: `list` (labelled rows: the left panel's buttons, and the
 * Settings editor), `pills` (icons in the right panel's header) or `strip` (icons at a window edge). Buttons, separators
 * and splits drag (`drag`, shared by the lists that trade slots) and have a right-click menu (`menu`, by the slot's
 * index in its list; none for the empty space). `slots` holds registered views only (and markers). A split (a new
 * pane) shows only in the strips and the Settings editor; elsewhere each pane has its own list.
 */
const props = defineProps<{
    list: PanelList
    /** The slots shown, with their index in the layout's list. */
    slots: { slot: PanelSlot, index: number }[]
    /** The layout list's length: where a drop past the last slot goes. */
    end: number
    variant: 'list' | 'pills' | 'strip'
    /** The views shown: one per pane. */
    active?: readonly PanelViewId[]
    /** Whether the active view's panel shows (a strip marks it only then). */
    open?: boolean
    drag: PanelDrag
    menu: (index?: number) => ContextMenuItem[][]
    kbds?: Partial<Record<PanelViewId, string[]>>
}>()
const emit = defineEmits<{ select: [id: PanelViewId] }>()
const {t} = useI18n()

const menuIndex = ref<number>()
const items = computed(() => props.menu(menuIndex.value))
function onContextmenu(event: MouseEvent) {
    const index = (event.target as Element).closest<HTMLElement>('[data-panel-slot]')?.dataset.panelSlot?.split(':')[1]
    menuIndex.value = index === undefined ? undefined : Number(index)
}

const dropIndex = computed(() => props.drag.dropAt.value?.list === props.list ? props.drag.dropAt.value.index : undefined)
const lineBefore = (k: number) => dropIndex.value !== undefined && dropIndex.value <= props.slots[k]!.index && (k === 0 || dropIndex.value > props.slots[k - 1]!.index)
const lineAtEnd = computed(() => dropIndex.value !== undefined && (!props.slots.length || dropIndex.value > props.slots.at(-1)!.index))

const isActive = (id: PanelViewId) => !!props.active?.includes(id) && (props.variant !== 'strip' || props.open)
const view = (id: PanelViewId) => panelViews.get(id)!
// A strip's tooltips point away from its window edge; the bottom area's buttons sit in the left strip.
const tooltipSide = computed(() => props.variant === 'strip' ? (props.list === 'right' ? 'left' : 'right') : 'bottom')
const LINE = {list: 'h-0.5 w-full', pills: 'w-0.5 h-5', strip: 'h-0.5 w-6'}
</script>

<template>
    <UContextMenu :items size="sm">
        <div
            :data-panel-list="list"
            :data-panel-end="end"
            :data-panel-axis="variant === 'pills' ? 'x' : 'y'"
            :class="{
                list: 'flex flex-col gap-px min-h-8',
                pills: 'inline-flex items-center gap-0.5 rounded-md bg-elevated/50 p-0.5 min-w-8 min-h-7 overflow-x-auto no-scrollbar',
                strip: 'flex flex-col items-center gap-1 min-h-8',
            }[variant]"
            @contextmenu.capture="onContextmenu"
            v-on="drag.listeners"
			data-tauri-drag-region
        >
            <template v-for="(s, k) in slots" :key="s.index">
                <div v-if="lineBefore(k)" :class="['shrink-0 rounded-full bg-primary', LINE[variant]]"/>
                <div
                    v-if="s.slot === 'separator'"
                    :data-panel-slot="`${list}:${s.index}`"
                    draggable="true"
                    :class="['shrink-0 flex items-center justify-center cursor-grab', variant === 'pills' ? 'px-0.5 self-stretch' : 'py-1 w-full']"
                    :aria-label="t('app.panels.separator')"
                >
                    <div :class="['bg-accented', variant === 'pills' ? 'w-px h-4' : variant === 'strip' ? 'h-px w-6' : 'h-px w-full']"/>
                </div>
                <div
                    v-else-if="s.slot === 'split'"
                    :data-panel-slot="`${list}:${s.index}`"
                    draggable="true"
                    :class="['shrink-0 w-full flex items-center justify-center gap-2 cursor-grab', variant === 'strip' ? 'py-3' : 'py-1.5']"
                    :aria-label="t('app.panels.split')"
                >
                    <div :class="['border-t border-dashed border-accented', variant === 'strip' ? 'w-6' : 'flex-1']"/>
                    <template v-if="variant === 'list'">
                        <span class="text-xs text-dimmed select-none">{{ t('app.panels.split') }}</span>
                        <div class="flex-1 border-t border-dashed border-accented"/>
                    </template>
                </div>
                <UTooltip v-else :text="t(view(s.slot).label)" :kbds="kbds?.[s.slot]" :content="{ side: tooltipSide }" :disabled="variant === 'list'">
                    <UButton
                        :data-panel-slot="`${list}:${s.index}`"
                        draggable="true"
                        color="neutral"
                        variant="ghost"
                        :size="variant === 'strip' ? 'md' : variant === 'pills' ? 'xs' : 'md'"
                        :icon="view(s.slot).icon"
                        :label="variant === 'list' ? t(view(s.slot).label) : undefined"
                        :aria-label="t(view(s.slot).label)"
                        :aria-pressed="isActive(s.slot)"
                        :block="variant === 'list'"
                        :class="[
                            variant === 'list' ? 'group justify-start' : '',
                            isActive(s.slot) ? (variant === 'pills' ? 'bg-default text-highlighted shadow-xs' : 'bg-elevated text-highlighted') : 'text-muted',
                        ]"
                        @click="emit('select', s.slot)"
                    >
                        <template v-if="variant === 'list' && kbds?.[s.slot]?.length" #trailing>
                            <span class="ms-auto flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
                                <UKbd v-for="kbd in kbds[s.slot]" :key="kbd" :value="kbd" size="sm" variant="soft" class="bg-accented/50"/>
                            </span>
                        </template>
                    </UButton>
                </UTooltip>
            </template>
            <div v-if="lineAtEnd" :class="['shrink-0 rounded-full bg-primary', LINE[variant]]"/>
        </div>
    </UContextMenu>
</template>
