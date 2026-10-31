import { emit, listen, type EventCallback } from '@tauri-apps/api/event';
import {AppEvent} from "#shared/constants/app";

export function useAppCrossWindowEvents() {
    async function emitQuitVertex() {
        await emit(AppEvent.quit)
    }

    async function listenQuitVertex(handler: EventCallback<unknown>) {
        return listen(AppEvent.quit, handler)
    }

    return {
        emitQuitVertex,
        listenQuitVertex
    }
}