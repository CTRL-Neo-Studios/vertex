/** One line in a row of the commit graph, between lanes: straight through, into the dot, or out of it. */
export interface GraphLine {
    from: number
    to: number
    /** `full`: a lane passing the row untouched. `top`: from the row's top into the dot. `bottom`: from the dot down. */
    half: 'full' | 'top' | 'bottom'
}

export interface GraphRow {
    /** The commit's dot. */
    lane: number
    /** How many lanes the row spans. */
    width: number
    lines: GraphLine[]
}

const freeLane = (lanes: (string | null)[]) => {
    const free = lanes.indexOf(null)
    return free === -1 ? lanes.length : free
}

/**
 * Lays out the graph of `commits`, children before parents (`git log --date-order`). Each lane waits for the commit
 * it leads to; a commit's dot sits in the lane waiting for it (a free one for a branch tip), lanes also waiting for
 * it bend in, and its parents take over: the first parent its lane, the others (a merge) the lane already waiting for
 * them or a free one. A parent another lane already waits for is joined right away, so lanes stay few, and lanes
 * never move sideways, so nothing crosses needlessly. Parents beyond `commits` (the next page) keep their lanes open.
 */
export function graphRows(commits: readonly { id: string, parents: readonly string[] }[]): GraphRow[] {
    const lanes: (string | null)[] = []
    return commits.map(commit => {
        let lane = lanes.indexOf(commit.id)
        const tip = lane === -1
        if (tip) {
            lane = freeLane(lanes)
            lanes[lane] = commit.id
        }
        const before = [...lanes]
        const lines: GraphLine[] = []

        // Every lane waiting for this commit ends in its dot.
        before.forEach((id, i) => {
            if (id !== commit.id) return
            if (i !== lane || !tip) lines.push({from: i, to: lane, half: 'top'})
            if (i !== lane) lanes[i] = null
        })

        const [first, ...others] = commit.parents
        lanes[lane] = null
        for (const parent of first === undefined ? [] : [first, ...others]) {
            let to = lanes.indexOf(parent)
            if (to === -1) {
                to = parent === first ? lane : freeLane(lanes)
                lanes[to] = parent
            }
            lines.push({from: lane, to, half: 'bottom'})
        }

        before.forEach((id, i) => {
            if (id && id !== commit.id && lanes[i] === id) lines.push({from: i, to: i, half: 'full'})
        })
        const width = Math.max(before.length, lanes.length)
        while (lanes.length && lanes.at(-1) === null) lanes.pop()
        return {lane, width, lines}
    })
}
