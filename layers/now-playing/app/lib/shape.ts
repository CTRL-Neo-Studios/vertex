/**
 * The line's shape: `count` dots across, each a bar whose height (0–1 of the row) is its band's level times an
 * envelope that is 0 at both ends and 1 in the middle. The bands are mirrored about the middle, lowest there: the bass,
 * which moves most, gets the tallest bars, and the two halves match.
 */
export function heights(levels: ArrayLike<number> | undefined, count: number): Float32Array {
    const out = new Float32Array(count)
    if (!levels || levels.length === 0 || count < 2) return out
    const bands = levels.length
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1)
        const fromMiddle = Math.abs(t - 0.5) * 2
        const band = Math.min(bands - 1, Math.floor(fromMiddle * bands))
        out[i] = (levels[band]! / 255) * Math.sin(Math.PI * t)
    }
    return out
}

/** One step of the bars' easing: up at once, down slowly, so they don't flicker. */
export function ease(shown: Float32Array, target: Float32Array): boolean {
    let moving = false
    for (let i = 0; i < shown.length; i++) {
        const next = Math.max(target[i] ?? 0, shown[i]! * 0.82)
        shown[i] = next < 0.005 ? 0 : next
        if (shown[i]! > 0) moving = true
    }
    return moving
}
