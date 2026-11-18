import type {ScannedEntry} from '#shared/types/active/workspace'
import {parentPathOf} from './parse'

/**
 * What changed under a workspace over a short quiet, as the disk has it when the batch is made (Watcher Plan): the
 * watcher's word on what kind of change it was isn't trusted, only which paths it named and which two were one rename.
 */
export interface WatchBatch {
    /** Two paths the watcher reported as one rename, with the target there. */
    renames: { from: string, to: string }[]
    /** Every other path named, once: `entry` is what's there now, absent when nothing is. */
    changes: { path: string, entry?: ScannedEntry }[]
}

/** What the plan needs to know of the index. */
export interface IndexView {
    has(path: string): boolean
}

/** What a batch does to the index, to apply in this order, each list in one pass. */
export interface BatchPlan {
    /** Renames and moves: the entries keep their uuids (`moveFileInIndex`). A folder takes what's in it. */
    moves: { from: string, to: string }[]
    /** Entries to take out (`removeFileFromIndex`), a folder with what's in it. */
    removes: string[]
    /** Paths to index (`addPaths`), a folder with what's in it. */
    adds: string[]
    /** Indexed files to read again. */
    reads: string[]
}

export interface PlanOptions {
    /** The workspace's root, absolute. */
    root: string
    /** False in a single-file window, which indexes only the file it opened: nothing is added. */
    wholeFolder: boolean
    /** The app itself just wrote this path: the watcher's word on it is skipped. */
    isSelfWrite(path: string): boolean
}

const under = (path: string, folder: string) => path.startsWith(`${folder}/`)

/**
 * What `batch` does to an index that knows `index`'s paths. Nothing under a dot name is indexed (as in a scan), so a
 * rename into one is a remove and out of one an add. A rename whose source isn't indexed is an add; one onto an indexed
 * path replaces that file. What's inside a folder that moves, goes or arrives isn't listed again.
 */
export function planBatch(batch: WatchBatch, index: IndexView, {root, wholeFolder, isSelfWrite}: PlanOptions): BatchPlan {
    const hidden = (path: string) => path.slice(root.length + 1).split('/').some(part => part.startsWith('.'))
    const moves: BatchPlan['moves'] = [], removes = new Set<string>(), adds = new Set<string>(), reads = new Set<string>()
    /** A path as it was before this batch's moves. */
    const before = (path: string) => {
        const move = moves.find(m => path === m.to || under(path, m.to))
        return move ? move.from + path.slice(move.to.length) : path
    }
    const add = (path: string) => { if (wholeFolder) adds.add(path) }

    for (const {from, to} of batch.renames) {
        if (isSelfWrite(from) && isSelfWrite(to)) continue
        // A rename of what an earlier one in this batch made (`a` → `b`, then `b` → `c`): one move, `a` → `c`.
        const chained = moves.find(m => m.to === from)
        if (chained) {
            if (hidden(to)) {
                moves.splice(moves.indexOf(chained), 1)
                removes.add(chained.from)
            } else chained.to = to
            continue
        }
        if (!index.has(from) || hidden(from)) {
            if (hidden(to)) continue
            if (index.has(to)) reads.add(to)
            else add(to)
        } else if (hidden(to)) removes.add(from)
        else if (index.has(to)) {
            // Onto a file that's indexed: that one stays, with new content, and the source is gone.
            removes.add(from)
            reads.add(to)
        } else moves.push({from, to})
    }
    for (const {path, entry} of batch.changes) {
        if (isSelfWrite(path) || hidden(path)) continue
        const was = before(path), known = index.has(was) && !removes.has(was)
        if (!entry) {
            // Where it is once the moves are made. A moved item's old path, or one inside it, went with the move.
            if (known && !moves.some(m => path === m.from || under(path, m.from))) removes.add(path)
        } else if (!known) add(path)
        else if (was === path && entry.name !== path.slice(path.lastIndexOf('/') + 1)) {
            // The folder lists it under another name: a rename of case, which a disk that ignores case reports as one path.
            moves.push({from: path, to: `${parentPathOf(path)}/${entry.name}`})
        } else if (!entry.is_directory) reads.add(path)
    }

    /** Whether a folder above `path` is in `paths`: what's in it then needs no line of its own. */
    const inside = (path: string, paths: ReadonlySet<string>) => {
        for (let folder = parentPathOf(path); folder.length > root.length; folder = parentPathOf(folder)) if (paths.has(folder)) return true
        return false
    }
    return {
        // A file renamed and back within the batch hasn't moved.
        moves: moves.filter(m => m.from !== m.to),
        removes: [...removes].filter(path => !inside(path, removes)).sort(),
        adds: [...adds].filter(path => !inside(path, adds)).sort(),
        reads: [...reads].filter(path => !adds.has(path) && !inside(path, adds)).sort(),
    }
}
