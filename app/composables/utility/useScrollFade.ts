import type {MaybeRefOrGetter} from "vue";

/**
 * The classes for a scroll area's fading edges (`scroll-fade` in main.css): the top fades once it's scrolled and,
 * with `bottom`, the bottom while there's more below. Then content growing or shrinking measures again, since it
 * doesn't scroll.
 */
export function useScrollFade(target: MaybeRefOrGetter<HTMLElement | null | undefined>, options: { bottom?: boolean } = {}) {
    const {arrivedState, measure} = useScroll(target, {offset: {top: 2, bottom: 2}})
    if (options.bottom) {
        useResizeObserver(target, () => measure())
        useMutationObserver(target, () => measure(), {childList: true, subtree: true})
    }
    return computed(() => ['scroll-fade', !arrivedState.top && 'fade-top', options.bottom && !arrivedState.bottom && 'fade-bottom'])
}
