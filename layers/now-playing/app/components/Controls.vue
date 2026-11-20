<script setup lang="ts">
/**
 * What's playing (title, artist, a progress bar) from macOS, previous / play-pause / next when the app playing is Music
 * or Spotify (the only players another app may control), the system volume, and the switch that makes the line move
 * with the music. Asked of the kernel about every 1.5 s while open; the progress moves between.
 */
import {computed, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue'
import {levelsError, media, type NowPlaying, type Player, position} from '../lib/media'
import {nowPlayingContext} from '../plugin'

const {t} = useI18n()
const ctx = nowPlayingContext()

const now = shallowRef<NowPlaying | null>()
/** `unsupported` when macOS won't say what's playing. */
const nowError = ref<string>()
const player = shallowRef<Player | null>(null)
const volume = ref<number>()
const clock = ref(Date.now())

async function refresh() {
    const [n, p, v] = await Promise.allSettled([media.nowPlaying(), media.player(), media.volume()])
    if (n.status === 'fulfilled') {
        now.value = n.value
        nowError.value = undefined
    } else nowError.value = String(n.reason)
    player.value = p.status === 'fulfilled' ? p.value : null
    if (v.status === 'fulfilled' && !dragging) volume.value = Math.round((v.value.muted ? 0 : v.value.volume) * 100)
}

let poll: ReturnType<typeof setInterval> | undefined
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => {
    void refresh()
    poll = setInterval(refresh, 1500)
    tick = setInterval(() => (clock.value = Date.now()), 250)
})
onBeforeUnmount(() => {
    clearInterval(poll)
    clearInterval(tick)
})

const at = computed(() => (now.value ? position(now.value, clock.value) : undefined))
const progress = computed(() => (now.value?.duration && at.value !== undefined ? (at.value / now.value.duration) * 100 : undefined))
const time = (s: number | undefined) => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

async function send(command: 'play_pause' | 'next' | 'previous') {
    if (!player.value) return
    await media.command(player.value.app, command).catch(e => (nowError.value = String(e)))
    setTimeout(refresh, 300)
}

let dragging = false
function setVolume(v: number | undefined) {
    if (v === undefined) return
    dragging = true
    volume.value = v
    void media.setVolume(v / 100).finally(() => (dragging = false))
}

const visualizer = computed({
    get: () => ctx.config.value.visualizer,
    set: v => void ctx.config.set({visualizer: v}),
})
</script>

<template>
  <div class="w-72 p-3 flex flex-col gap-3 text-sm" data-now-playing-controls>
    <div v-if="now?.title" class="min-w-0">
      <div class="truncate font-medium text-highlighted">{{ now.title }}</div>
      <div v-if="now.artist" class="truncate text-muted">{{ now.artist }}</div>
      <div v-if="progress !== undefined" class="mt-2 flex items-center gap-2 text-xs text-muted tabular-nums">
        <span>{{ time(at) }}</span>
        <UProgress :model-value="progress" size="xs" class="flex-1"/>
        <span>{{ time(now.duration ?? undefined) }}</span>
      </div>
    </div>
    <div v-else class="text-muted">{{ nowError === 'unsupported' ? t('plugins.now-playing.noInfo') : t('plugins.now-playing.nothing') }}</div>

    <div v-if="player" class="flex items-center justify-center gap-1">
      <UButton icon="i-lucide-skip-back" color="neutral" variant="ghost" :aria-label="t('plugins.now-playing.previous')" @click="send('previous')"/>
      <UButton
        :icon="player.state === 'playing' ? 'i-lucide-pause' : 'i-lucide-play'"
        color="neutral"
        variant="soft"
        size="lg"
        :aria-label="t(player.state === 'playing' ? 'plugins.now-playing.pause' : 'plugins.now-playing.play')"
        @click="send('play_pause')"
      />
      <UButton icon="i-lucide-skip-forward" color="neutral" variant="ghost" :aria-label="t('plugins.now-playing.next')" @click="send('next')"/>
    </div>
    <div v-else-if="now?.title" class="text-xs text-dimmed">{{ t('plugins.now-playing.controlsOnly') }}</div>

    <div v-if="volume !== undefined" class="flex items-center gap-2">
      <UIcon :name="volume === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'" class="size-4 shrink-0 text-muted"/>
      <USlider :model-value="volume" :min="0" :max="100" size="xs" :aria-label="t('plugins.now-playing.volume')" @update:model-value="setVolume"/>
    </div>

    <USeparator/>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="font-medium">{{ t('plugins.now-playing.moveWithMusic') }}</div>
        <div class="text-xs text-muted">{{ t('plugins.now-playing.moveWithMusicHelp') }}</div>
        <div v-if="visualizer && levelsError" class="mt-1 text-xs text-error">{{ levelsError === 'unsupported' ? t('plugins.now-playing.levelsUnsupported') : levelsError }}</div>
      </div>
      <USwitch v-model="visualizer"/>
    </div>
  </div>
</template>
