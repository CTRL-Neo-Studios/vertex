import type {InjectionKey} from "vue";
import type {PanelList, PanelSlotRef} from "#shared/utils/panelLayout";

/**
 * Drag and drop of panel slots between lists (HTML5, as in ChatsPanel; windows set `dragDropEnabled: false` so it
 * works). A slot element carries `data-panel-slot="<list>:<index>"`; a list container `data-panel-list` and
 * `data-panel-end` (its length, for a drop past the last slot), and `data-panel-axis="x"` when it runs sideways.
 * `drop` gets the slot and where it goes (the index it's inserted before).
 */
export function usePanelDrag(drop: (from: PanelSlotRef, to: PanelSlotRef) => unknown) {
    const dragging = ref<PanelSlotRef | null>(null)
    /** Where a drop would land now. */
    const dropAt = ref<PanelSlotRef | null>(null)

    const slotOf = (target: EventTarget | null) => {
        const el = (target as Element | null)?.closest?.<HTMLElement>('[data-panel-slot]')
        const [list, index] = el?.dataset.panelSlot?.split(':') ?? []
        return el && list ? {el, ref: {list: list as PanelList, index: Number(index)}} : undefined
    }

    function onDragstart(event: DragEvent) {
        const slot = slotOf(event.target)
        if (!slot || !event.dataTransfer) return
        dragging.value = slot.ref
        event.dataTransfer.effectAllowed = 'move'
        // WebKit starts a drag only with some data set.
        event.dataTransfer.setData('text/plain', `${slot.ref.list}:${slot.ref.index}`)
    }

    function onDragover(event: DragEvent) {
        if (!dragging.value) return
        const slot = slotOf(event.target)
        if (slot) {
            const box = slot.el.getBoundingClientRect()
            const sideways = !!slot.el.closest('[data-panel-axis="x"]')
            const after = sideways ? event.clientX > box.left + box.width / 2 : event.clientY > box.top + box.height / 2
            dropAt.value = {list: slot.ref.list, index: slot.ref.index + (after ? 1 : 0)}
        } else {
            const list = (event.target as Element | null)?.closest?.<HTMLElement>('[data-panel-list]')
            dropAt.value = list ? {list: list.dataset.panelList as PanelList, index: Number(list.dataset.panelEnd)} : null
        }
        if (!dropAt.value) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }

    function onDragend() {
        dragging.value = null
        dropAt.value = null
    }

    function onDrop(event: DragEvent) {
        const from = dragging.value
        const to = dropAt.value
        onDragend()
        if (!from || !to) return
        event.preventDefault()
        void drop(from, to)
    }

    return {dragging, dropAt, listeners: {dragstart: onDragstart, dragover: onDragover, dragend: onDragend, drop: onDrop}}
}

/** The window's drag state, provided by the session layout to every list of panel buttons. */
export const PANEL_DRAG: InjectionKey<PanelDrag> = Symbol('panelDrag')
export type PanelDrag = ReturnType<typeof usePanelDrag>
