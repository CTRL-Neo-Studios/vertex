import type {AppWebviewWindowEvents} from "#shared/types/app/events";

export function useAppWindowEventBus() {
    return useEventDispatcher<AppWebviewWindowEvents>('app.events.window-bus')
}