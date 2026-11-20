import {Channel, invoke as tauriInvoke, type InvokeArgs} from '@tauri-apps/api/core'
import {shallowRef} from 'vue'

/** The kernel's side (`tauri-plugin-vertex-media`). */
const invoke = <T>(command: string, args?: InvokeArgs) => tauriInvoke<T>(`plugin:vertex-media|${command}`, args)

export interface NowPlaying {
    /** The playing app's bundle id. */
    app: string | null
    playing: boolean
    title: string | null
    artist: string | null
    album: string | null
    duration: number | null
    /** The position at `timestamp`, in seconds. */
    elapsed: number | null
    rate: number | null
    timestamp: string | null
}

export interface Player {
    app: 'music' | 'spotify'
    state: 'playing' | 'paused'
}

export const media = {
    nowPlaying: () => invoke<NowPlaying | null>('media_now_playing'),
    player: () => invoke<Player | null>('media_player'),
    command: (app: Player['app'], command: 'play_pause' | 'next' | 'previous') => invoke<void>('media_command', {app, command}),
    volume: () => invoke<{ volume: number, muted: boolean }>('media_volume'),
    setVolume: (volume: number) => invoke<void>('media_set_volume', {volume}),
}

/** Where a track is now, in seconds: its position at `timestamp`, moved on by its rate. */
export function position(now: NowPlaying, at = Date.now()): number | undefined {
    if (now.elapsed === null) return undefined
    const since = now.timestamp ? Math.max(0, (at - Date.parse(now.timestamp)) / 1000) : 0
    const moved = now.elapsed + (now.rate ?? 0) * since
    return now.duration === null ? moved : Math.min(now.duration, moved)
}

/**
 * The system's audio as 32 band levels (0–255), the latest frame; one listener for the window however many lines
 * draw it, stopped while the window is hidden. `error` is what the kernel said when it couldn't start (`unsupported`,
 * or the failing step).
 */
export const levels = shallowRef<Uint8Array>()
export const levelsError = shallowRef<string>()
let users = 0
let listening: Promise<number | undefined> | undefined

function start() {
    if (listening || document.hidden) return
    const channel = new Channel<ArrayBuffer>()
    channel.onmessage = frame => (levels.value = new Uint8Array(frame))
    levelsError.value = undefined
    listening = invoke<number>('media_levels_listen', {channel}).catch((e) => {
        levelsError.value = String(e)
        return undefined
    })
}

function stop() {
    const id = listening
    listening = undefined
    levels.value = undefined
    void id?.then(id => id !== undefined && invoke('media_levels_stop', {id}))
}

let watching = false

/** Starts listening for one more user; the returned function lets it go. */
export function useLevels(): () => void {
    if (!watching) {
        watching = true
        document.addEventListener('visibilitychange', () => (document.hidden ? stop() : users > 0 && start()))
    }
    if (users++ === 0) start()
    let done = false
    return () => {
        if (done) return
        done = true
        if (--users === 0) stop()
    }
}
