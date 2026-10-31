/**
 * Remembers paths the app itself just wrote or renamed, so the file watcher can tell our own
 * changes from external ones and not process them twice.
 */
export class RecentWrites {
    private until = new Map<string, number>()

    constructor(private windowMs = 1500, private now: () => number = Date.now) {}

    mark(...paths: string[]) {
        const t = this.now() + this.windowMs
        for (const p of paths) this.until.set(p, t)
    }

    /** True if `path` was marked within the window. Expired entries are dropped. */
    has(path: string) {
        const t = this.until.get(path)
        if (t === undefined) return false
        if (t >= this.now()) return true
        this.until.delete(path)
        return false
    }
}
