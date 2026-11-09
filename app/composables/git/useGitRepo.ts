import type {ActiveSession} from "#shared/types/active/sessions";
import type {GitFile, GitStatus} from "#shared/types/app/git";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {GitError, gitClient} from "~/utils/gitClient";

type GitErrorKey = keyof typeof GitError
/** Why there's no status to show: no git, or the workspace isn't in a repository. */
export type GitProblem = typeof GitError.missing | typeof GitError.notRepo

const errorKey = (error: string) => (Object.keys(GitError) as GitErrorKey[]).find(k => GitError[k] === error)

/** What a new repository leaves out: system clutter, Vertex's trash and its temp files. */
const IGNORED = ['.DS_Store', 'Thumbs.db', 'desktop.ini', '.vertex/trash/', '.vertex/**/*.tmp']
/** Chats stored in the workspace: encrypted files git can't merge, so two devices changing one chat conflict. */
const CHATS = '.vertex/chats/'

/**
 * A workspace's repository for the views that show it: its status, kept fresh from the watcher (the working copy and
 * `.git/` both), window focus and every operation; the operations, one at a time from here, each failure explained
 * in a toast with the next step.
 */
export function useGitRepo(session: ActiveSession | undefined) {
    const {t} = useI18n()
    const toast = useToast()
    const root = session?.rootPath
    const status = shallowRef<GitStatus>()
    const problem = ref<GitProblem>()
    /** What's running (translated), `undefined` when idle. */
    const busy = ref<string>()

    let loading: Promise<void> | undefined
    let stale = false
    /** Re-reads the status; a call while one runs makes it read once more after. */
    function refresh(): Promise<void> {
        if (!root) return Promise.resolve()
        if (loading) {
            stale = true
            return loading
        }
        loading = (async () => {
            do {
                stale = false
                try {
                    status.value = await gitClient.status(root)
                    problem.value = undefined
                } catch (e) {
                    const error = String(e)
                    if (error === GitError.missing || error === GitError.notRepo) {
                        problem.value = error
                        status.value = undefined
                    } else console.error('[git] status', error)
                }
            } while (stale)
        })().finally(() => {
            loading = undefined
        })
        return loading
    }

    // A burst of events (a commit writes dozens of objects) is one refresh.
    const refreshSoon = useDebounceFn(refresh, 250)
    onBeforeUnmount(useActiveWorkspaceIndex(session).on(event => {
        if (event.type === 'changed') void refreshSoon()
    }))
    // A commit made in a terminal, or a repository outside the watched folder.
    const focused = useWindowFocus()
    watch(focused, now => now && void refresh())
    onMounted(refresh)

    function explain(error: string) {
        const key = errorKey(error)
        const actions = key === 'rejected'
            ? [{label: t('app.git.pullAction'), color: 'neutral' as const, variant: 'outline' as const, onClick: () => void pull()}]
            : key === 'conflict' && status.value?.merging
                ? [{label: t('app.git.merging.abort'), color: 'neutral' as const, variant: 'outline' as const, onClick: () => void mergeAbort()}]
                : undefined
        toast.add({
            title: key ? t(`app.git.errors.${key}.title`) : t('app.git.errors.failed'),
            description: key ? t(`app.git.errors.${key}.description`) : error,
            color: 'error',
            icon: 'i-lucide-circle-alert',
            actions,
        })
    }

    /** Runs `op` as `label`, then refreshes; false (after explaining why, from the fresh status) when it failed. */
    async function run(label: string, op: (root: string) => Promise<unknown>): Promise<boolean> {
        if (!root) return false
        busy.value = label
        let error: string | undefined
        try {
            await op(root)
        } catch (e) {
            error = String(e)
        }
        busy.value = undefined
        await refresh()
        if (error) explain(error)
        return !error
    }

    /** A file's paths for git commands: a staged rename's old path goes with it. */
    const pathsOf = (files: readonly GitFile[]) => files.flatMap(f => (f.origPath ? [f.path, f.origPath] : [f.path]))

    const stage = (files: readonly GitFile[]) => run(t('app.git.working'), r => gitClient.stage(r, pathsOf(files)))
    const unstage = (files: readonly GitFile[]) => run(t('app.git.working'), r => gitClient.unstage(r, pathsOf(files)))
    const discard = (files: readonly GitFile[]) => run(t('app.git.working'), r => gitClient.discard(r, pathsOf(files)))
    const fetch = () => run(t('app.git.fetching'), gitClient.fetch)
    const pull = () => run(t('app.git.pulling'), gitClient.pull)
    const push = () => run(t('app.git.pushing'), gitClient.push)
    const mergeAbort = () => run(t('app.git.working'), gitClient.mergeAbort)
    const switchBranch = (name: string, create: boolean) => run(t('app.git.switching'), r => gitClient.switch(r, name, create))
    /** Makes the workspace a repository with a `.gitignore`; `syncChats` keeps workspace-stored chats in it. */
    const init = (syncChats: boolean) => run(t('app.git.creating'), r => gitClient.init(r, syncChats ? IGNORED : [...IGNORED, CHATS]))
    /** Commits what's staged, or every change when nothing is. */
    const commit = (message: string) => {
        const all = !status.value?.files.some(isStaged)
        return run(t('app.git.committing'), r => gitClient.commit(r, message, all))
    }

    /** Commit every change (with `message`, or a default), pull, push: the one button for keeping devices in step. */
    async function sync(message: string) {
        await refresh()
        const current = status.value
        if (!current) return false
        if (current.merging) {
            explain(GitError.conflict)
            return false
        }
        const count = current.files.length
        if (count && !await run(t('app.git.committing'), r => gitClient.commit(r, message || t('app.git.syncMessage', {count}), true))) return false
        // A branch that tracks nothing yet has nothing to pull; its first push sets the upstream.
        if (current.upstream && !await pull()) return false
        return push()
    }

    return {status, problem, busy, refresh, init, stage, unstage, discard, commit, fetch, pull, push, sync, mergeAbort, switchBranch}
}

/** Whether a file has changes staged for the next commit. */
export const isStaged = (f: GitFile) => f.index !== '.' && f.index !== '?' && !f.conflicted
/** Whether a file has changes not staged yet (new files and conflicts included). */
export const isUnstaged = (f: GitFile) => f.worktree !== '.' || f.conflicted
