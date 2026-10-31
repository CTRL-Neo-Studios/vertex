import { emit, listen, type EventCallback } from '@tauri-apps/api/event';

export function useAppCrossWindowEvents() {
    async function emitQuitVertex() {
        await emit('vertex://app:actions:quit')
    }

    async function listenQuitVertex(handler: EventCallback<unknown>) {
        return listen('vertex://app:actions:quit', handler)
    }

    return {
        emitQuitVertex,
        listenQuitVertex
    }
}