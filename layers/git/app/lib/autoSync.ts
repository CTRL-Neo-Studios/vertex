import type {SessionContext} from "#shared/plugin/api";
import {gitConfigOf} from "../../shared/config";
import {gitContext} from "../plugin";
import {useCommitMessage} from "./commitMessage";
import {autoSyncPaused, errorKey, isGitRepo} from "./repo";
import {GitError, gitClient} from "./client";

// ponytail: fixed gap between focus pulls; make it a setting if switching windows a lot pulls too often.
const FOCUS_PULL_GAP = 60_000

/**
 * Auto-sync for a workspace window (`plugins.config.git.autoSync` in its effective settings: global, or the workspace's own
 * once its folder is trusted; all off by default): every `interval` minutes and, with `onOpen`, once when the window
 * opens, it commits every change, pulls and pushes, like Sync; with `pullOnFocus`, it pulls when the window gets
 * focus. The commit's message is the model's with the git config's `commitMessages.autoSync` (falling back quietly), else
 * "Update N file(s)". It runs only in a repository, never during a merge or rebase, and stops after the remote
 * refuses to sign in (`autoSyncPaused`) until an operation from the Git view works. Each kind of failure shows once,
 * until a run succeeds. It runs beside the Git view, which picks its changes up from the watcher. Runs in the git
 * plugin's `onSession` callback (an effect scope, no component), so nothing here needs a component.
 */
export function useGitAutoSync({session, views}: SessionContext) {
    const root = session.rootPath
    if (!root) return
    const {t} = useNuxtApp().$i18n
    const toast = useToast()
    const auto = computed(() => gitConfigOf(gitContext().config.value).autoSync)
    const commitMessage = useCommitMessage(root)

    let running = false
    let lastPull = 0
    /** The failure last shown; it shows again only after a run succeeds. */
    let shown: string | undefined

    function fail(error: string) {
        if (error === GitError.auth) autoSyncPaused.add(root!)
        if (shown === error) return
        shown = error
        const key = errorKey(error)
        toast.add({
            title: t(error === GitError.auth ? 'plugins.git.autoSync.paused' : 'plugins.git.autoSync.failed'),
            description: key ? t(`plugins.git.errors.${key}.description`) : error,
            color: 'warning',
            icon: 'i-lucide-refresh-cw-off',
            actions: [{label: t('plugins.git.autoSync.open'), color: 'neutral', variant: 'outline', onClick: () => void views.show('git')}],
        })
    }

    async function run(pullOnly: boolean) {
        if (running || !isGitRepo(root) || autoSyncPaused.has(root!)) return
        running = true
        try {
            const status = await gitClient.status(root!)
            // A merge waits for the user; so does auto-sync.
            if (status.merging || status.files.some(f => f.conflicted)) return fail(GitError.conflict)
            const count = status.files.length
            if (!pullOnly && count) {
                const written = commitMessage.onAutoSync.value ? await commitMessage.generate(status, true).catch(() => '') : ''
                await gitClient.commit(root!, written || t('plugins.git.syncMessage', {count}), true)
            }
            if (status.upstream) {
                lastPull = Date.now()
                await gitClient.pull(root!)
            }
            if (!pullOnly) await gitClient.push(root!)
            shown = undefined
        } catch (e) {
            fail(String(e))
        } finally {
            running = false
        }
    }

    let timer: ReturnType<typeof setInterval> | undefined
    watch(() => auto.value?.interval ?? 0, minutes => {
        clearInterval(timer)
        timer = minutes > 0 ? setInterval(() => void run(false), minutes * 60_000) : undefined
    }, {immediate: true})
    onScopeDispose(() => clearInterval(timer))

    // Once, as soon as the window knows it's a repository (and the settings are in).
    let opened = false
    watch([() => isGitRepo(root), () => auto.value?.onOpen], ([repo, onOpen]) => {
        if (opened || !repo || auto.value === undefined) return
        opened = true
        if (onOpen) void run(false)
    }, {immediate: true})

    watch(useWindowFocus(), focused => {
        if (focused && auto.value?.pullOnFocus && Date.now() - lastPull > FOCUS_PULL_GAP) void run(true)
    })
}
