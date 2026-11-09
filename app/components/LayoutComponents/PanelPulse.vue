<script setup lang="ts">
import {animate, useReducedMotion} from "motion-v";

/**
 * The empty stretch of a pane's header row: a hairline that beats like a heart monitor, once when the pointer passes
 * over it and again and again while the pane's view is busy (`usePanelBusy`: a git sync…). With reduced motion it
 * stays still and takes the primary color while busy. It's part of the window's drag region.
 */
const props = defineProps<{ active?: boolean }>()

const el = useTemplateRef<HTMLElement>('el')
const {width} = useElementSize(el)
const reduced = useReducedMotion()
const gradient = useId()

const MID = 8
/** One beat around its centre: a small wave, the spike and its dip, back to the line. */
const BEAT = [[-14, 0], [-10, -1.5], [-7, 0], [-3, 0], [-1, -6], [1.5, 5], [3.5, 0], [14, 0]] as const
/** Where the beat's centre is while it travels; `undefined` between beats. */
const at = ref<number>()
const line = computed(() => {
    const x = at.value
    const beat = x === undefined ? '' : BEAT.map(([dx, dy]) => `L${x + dx} ${MID + dy}`).join(' ')
    return `M0 ${MID} ${beat} L${width.value} ${MID}`
})

let running: { stop: () => void } | undefined
let next: ReturnType<typeof setTimeout> | undefined
function beat() {
    if (running || reduced.value || width.value < 40) return
    running = animate(-16, width.value + 16, {
        duration: Math.min(Math.max(width.value / 260, 0.7), 1.4),
        ease: 'easeInOut',
        onUpdate: x => (at.value = x),
        onComplete: () => {
            running = undefined
            at.value = undefined
            if (props.active) next = setTimeout(beat, 380)
        },
    })
}
watch(() => props.active, active => active && beat(), {immediate: true})
onBeforeUnmount(() => {
    running?.stop()
    clearTimeout(next)
})
</script>

<template>
    <div ref="el" class="flex-1 min-w-4 h-4 self-center" data-tauri-drag-region @pointerenter="beat">
        <svg :width="width" height="16" class="block overflow-visible pointer-events-none" aria-hidden="true">
            <defs>
                <linearGradient :id="gradient" gradientUnits="userSpaceOnUse" :x1="(at ?? 0) - 40" :x2="(at ?? 0) + 40" y1="0" y2="0">
                    <stop offset="0" stop-color="var(--ui-primary)" stop-opacity="0"/>
                    <stop offset="0.5" stop-color="var(--ui-primary)"/>
                    <stop offset="1" stop-color="var(--ui-primary)" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path
                :d="line"
                fill="none"
                stroke-width="1"
                stroke-linejoin="round"
                :class="active && reduced ? 'stroke-primary' : 'stroke-(--ui-border-accented)'"
            />
            <!-- The glow that rides along with the beat. -->
            <path v-if="at !== undefined" :d="line" fill="none" :stroke="`url(#${gradient})`" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
    </div>
</template>
