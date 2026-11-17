import type {PluginApis, PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import {useGitAutoSync} from '~/composables/git/useGitAutoSync'
import {isGitRepo, watchGitPresence} from '~/composables/git/useGitRepo'
import {diffSpecOf, diffTitle} from '~/utils/gitDiff'
import {useAppSessionActions} from '~/composables/app/useAppSessionActions'
import GitCloneModal from '~/components/Git/GitCloneModal.vue'

let use: PluginContext['use'] | undefined
/** Another plugin's API while that plugin is on, for git's code (AI writes commit messages when it's on). */
export const gitUses = <K extends keyof PluginApis>(id: K) => use?.(id)

export default definePlugin({
    setup(ctx) {
        use = ctx.use
        ctx.whenPlugin('ai', ai => ai.registerFeature({id: 'commitMessage', label: 'app.aiFeatures.commitMessage', description: 'app.aiFeatures.commitMessageDescription'}))
        ctx.views.panel({
            id: 'git', label: 'app.git.label', icon: 'i-lucide-git-branch', defaultArea: 'left',
            when: c => c.isWorkspace,
            component: () => import('~/components/Git/GitChangesView.vue'),
        })
        ctx.views.panel({
            id: 'gitHistory', label: 'app.git.history.label', icon: 'i-lucide-git-graph', defaultArea: 'bottom', tab: true,
            // Only where there's a history, so a workspace without git doesn't get a bottom area for it.
            when: c => c.isWorkspace && isGitRepo(c.session?.rootPath),
            component: () => import('~/components/Git/GitHistoryView.vue'),
        })
        // One file's diff from git (Changes and History open it; the id is `diffTabId`'s).
        const {t} = useNuxtApp().$i18n
        ctx.views.tabKind({
            kind: 'git-diff',
            describe(id) {
                const spec = diffSpecOf(id)
                return spec && {label: diffTitle(spec, t), icon: 'i-lucide-git-compare'}
            },
            component: () => import('~/components/Git/GitDiffView.vue'),
        })
        ctx.settings.page({id: 'git', label: 'app.settings.nav.git', icon: 'i-lucide-git-branch', component: () => import('~/components/Settings/Git/GitSettings.vue')})
        // Clicks run outside the Nuxt app's context; `cloneWorkspace` needs it for its composables.
        const nuxtApp = useNuxtApp()
        ctx.home.action({id: 'clone-workspace', label: 'app.home.cloneWorkspace', icon: 'i-lucide-folder-git-2', run: () => nuxtApp.runWithContext(cloneWorkspace)})
        // Whether the workspace is a git repository (for the History view), and auto-sync when it's on.
        ctx.onSession(context => {
            if (!context.session.workspaceSession) return
            watchGitPresence(context.session)
            useGitAutoSync(context)
        })
    },
})

/** Clones a repository into a new folder (`GitCloneModal`) and opens it as a workspace. */
async function cloneWorkspace() {
    const {openWorkspaceFromPath} = useAppSessionActions()
    const path = await useOverlay().create(GitCloneModal, {destroyOnClose: true}).open().result
    if (path) await openWorkspaceFromPath(path)
}
