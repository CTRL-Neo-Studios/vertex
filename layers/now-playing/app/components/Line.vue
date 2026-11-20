<script setup lang="ts">
/**
 * Now Playing's line: the rest of a pane's action row (`ctx.views.paneRule`). Dots at rest; with "Move with the
 * music" on and sound playing, each dot a bar grown both ways from the middle, tallest in the middle of the line and
 * nothing at its ends (`heights`). Drawn on a canvas, only while something moves. Primary when hovered or open; a
 * click opens the play controls.
 */
import type {PaneRuleProps} from '#shared/plugin/api'
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch} from 'vue'
import {levels, useLevels} from '../lib/media'
import {ease, heights} from '../lib/shape'
import {nowPlayingContext} from '../plugin'

defineProps<PaneRuleProps>()

const {t} = useI18n()
const ctx = nowPlayingContext()
const on = computed(() => ctx.config.value.visualizer)
const open = ref(false)
const hovered = ref(false)
const lit = computed(() => hovered.value || open.value)

/** Pixels from one dot to the next, and a dot's width. */
const GAP = 6
const DOT = 2
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const still = matchMedia('(prefers-reduced-motion: reduce)')
let size = {width: 0, height: 0}
let shown = new Float32Array(0)
let frame = 0

function draw() {
    frame = 0
    const el = canvas.value
    const {width, height} = size
    if (!el || !width) return
    const count = Math.max(2, Math.floor(width / GAP))
    if (shown.length !== count) shown = new Float32Array(count)
    const moving = ease(shown, heights(levels.value, count))
    const g = el.getContext('2d')!
    g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    g.clearRect(0, 0, width, height)
    g.fillStyle = getComputedStyle(el).color
    const step = width / count
    for (let i = 0; i < count; i++) {
        const level = shown[i]!
        // Reduced motion: the bars stay dots, and only brighten with the sound.
        const bar = still.matches ? DOT : Math.max(DOT, level * (height - 4))
        g.globalAlpha = still.matches ? 0.6 + 0.4 * level : 1
        g.beginPath()
        g.roundRect(Math.round(i * step + (step - DOT) / 2), (height - bar) / 2, DOT, bar, DOT / 2)
        g.fill()
    }
    if (moving) frame = requestAnimationFrame(draw)
}
const redraw = () => {
    frame ||= requestAnimationFrame(draw)
}

const resize = new ResizeObserver(([entry]) => {
    const el = canvas.value
    if (!el || !entry) return
    size = {width: entry.contentRect.width, height: entry.contentRect.height}
    el.width = Math.round(size.width * devicePixelRatio)
    el.height = Math.round(size.height * devicePixelRatio)
    redraw()
})
onMounted(() => canvas.value && resize.observe(canvas.value))

let release: (() => void) | undefined
watch(on, (yes) => {
    if (yes) release ??= useLevels()
    else {
        release?.()
        release = undefined
    }
}, {immediate: true})
watch([levels, lit], redraw)

onBeforeUnmount(() => {
    release?.()
    resize.disconnect()
    cancelAnimationFrame(frame)
})
</script>

<template>
  <UPopover v-model:open="open" :content="{side: 'bottom', align: 'center', sideOffset: 6}">
    <UTooltip :text="t('plugins.now-playing.showControls')" :disabled="open" :content="{side: 'top'}">
      <button
        type="button"
        class="absolute inset-0 cursor-pointer"
        :class="lit ? 'text-primary' : 'text-dimmed'"
        :aria-label="t('plugins.now-playing.showControls')"
        data-now-playing-line
        @pointerenter="hovered = true"
        @pointerleave="hovered = false"
      >
        <canvas ref="canvas" class="block size-full"/>
      </button>
    </UTooltip>
    <template #content>
      <NowPlayingControls/>
    </template>
  </UPopover>
</template>
