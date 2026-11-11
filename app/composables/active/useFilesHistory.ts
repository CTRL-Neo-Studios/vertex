import useQuickToasts from "~/composables/utility/useQuickToasts";

/**
 * One Files operation that can be undone, named by `label` ("Move 3 item(s)"). `undo` and `redo` do what they still
 * can and return the names of what they skipped: items changed, moved or taken since.
 */
export interface FilesStep { label: string, undo: () => Promise<string[]>, redo: () => Promise<string[]> }

const LIMIT = 50
type History = { done: FilesStep[], undone: FilesStep[], busy: boolean }
const histories = new Map<string, History>()

/**
 * What Files did in a session, in memory, to undo and redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, a toast's Undo). The last
 * 50 steps are kept, and a new step clears what was undone. One undo or redo runs at a time; what it skips is named in
 * one toast.
 */
export function useFilesHistory(sessionId: string | undefined) {
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const key = sessionId ?? ''
    if (!histories.has(key)) histories.set(key, shallowReactive({done: [], undone: [], busy: false}))
    const history = histories.get(key)!

    function push(step: FilesStep) {
        history.done = [...history.done.slice(1 - LIMIT), step]
        history.undone = []
    }

    /** Undoes the last step (redoes the last undone one); `only`, a toast's own step, only while it's the last. */
    async function run(back: boolean, only?: FilesStep) {
        const from = back ? 'done' : 'undone', to = back ? 'undone' : 'done'
        const step = history[from].at(-1)
        if (!step || history.busy) return
        if (only && only !== step) return $qt.info(t('app.editor.ui.filetree.undoNotLast'))
        history.busy = true
        history[from] = history[from].slice(0, -1)
        try {
            const skipped = await (back ? step.undo() : step.redo())
            history[to] = [...history[to], step]
            if (skipped.length) $qt.warning(t(back ? 'app.editor.ui.filetree.undoSkipped' : 'app.editor.ui.filetree.redoSkipped', {names: skipped.join(', ')}))
        } catch (error) {
            $qt.error(t(back ? 'app.editor.ui.filetree.undoFailed' : 'app.editor.ui.filetree.redoFailed'), String(error))
        } finally {
            history.busy = false
        }
    }

    return {
        push,
        undo: (only?: FilesStep) => run(true, only),
        redo: () => run(false),
        undoLabel: computed(() => history.done.at(-1)?.label),
        redoLabel: computed(() => history.undone.at(-1)?.label),
    }
}
