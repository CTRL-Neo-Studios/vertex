export interface TourStep {
    /** A selector for the element the step points at. */
    target: string,
    title: string,
    description: string,
}

/**
 * A guided tour over a view, one step at a time, drawn by `TourPopover`. Steps whose target isn't on screen when it
 * starts are left out (a section with no files, a branch with no upstream).
 */
export function useTour(steps: () => TourStep[]) {
    const shown = shallowRef<TourStep[]>([])
    const index = ref(-1)
    const step = computed(() => shown.value[index.value])
    const target = computed(() => (step.value ? document.querySelector<HTMLElement>(step.value.target) ?? undefined : undefined))

    function start() {
        shown.value = steps().filter(s => document.querySelector(s.target))
        index.value = shown.value.length ? 0 : -1
    }
    const next = () => void (index.value = index.value + 1 < shown.value.length ? index.value + 1 : -1)
    const back = () => void (index.value = Math.max(index.value - 1, 0))
    const stop = () => void (index.value = -1)

    return {step, index, count: computed(() => shown.value.length), target, start, next, back, stop}
}

export type Tour = ReturnType<typeof useTour>
