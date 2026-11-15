/**
 * Drag-to-reorder for a short list (sorts, views, properties, groups), with HTML5 drag and drop. Spread `bind(i)` on
 * each row; `move(from, to)` runs on drop. `over` is the row under the pointer, for a drop marker.
 */
export function useListDrag(move: (from: number, to: number) => void) {
    const dragging = ref<number | null>(null)
    const over = ref<number | null>(null)
    const reset = () => {
        dragging.value = null
        over.value = null
    }
    const bind = (index: number) => ({
        draggable: true,
        onDragstart: (event: DragEvent) => {
            dragging.value = index
            event.dataTransfer?.setData('text/plain', '')
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
        },
        onDragover: (event: DragEvent) => {
            if (dragging.value === null) return
            event.preventDefault()
            over.value = index
        },
        onDrop: (event: DragEvent) => {
            event.preventDefault()
            const from = dragging.value
            reset()
            if (from !== null && from !== index) move(from, index)
        },
        onDragend: reset,
    })
    return {bind, dragging, over}
}

/** `list` with the item at `from` moved to `to`. */
export const moved = <T>(list: readonly T[], from: number, to: number): T[] => list.toSpliced(from, 1).toSpliced(to, 0, list[from]!)
