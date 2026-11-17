import type {HomeActionContext, PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import {useGitAutoSync} from './lib/autoSync'
import {isGitRepo, watchGitPresence} from './lib/repo'
import {diffSpecOf, diffTitle} from './lib/diff'
import GitCloneModal from './components/CloneModal.vue'

let ctx: PluginContext | undefined
/** The plugin's context, for its components and composables (they work only while it runs). */
export const gitContext = () => ctx!

export default definePlugin({
    setup(context) {
        ctx = context
        context.whenPlugin('ai', ai => ai.registerFeature({id: 'commitMessage', label: 'plugins.git.commitMessageFeature.label', description: 'plugins.git.commitMessageFeature.description'}))
        context.views.panel({
            id: 'git', label: 'plugins.git.label', icon: 'i-lucide-git-branch', defaultArea: 'left',
            when: c => c.isWorkspace,
            component: () => import('./components/ChangesView.vue'),
        })
        context.views.panel({
            id: 'gitHistory', label: 'plugins.git.history.label', icon: 'i-lucide-git-graph', defaultArea: 'bottom', tab: true,
            // Only where there's a history, so a workspace without git doesn't get a bottom area for it.
            when: c => c.isWorkspace && isGitRepo(c.session?.rootPath),
            component: () => import('./components/HistoryView.vue'),
        })
        // One file's diff from git (Changes and History open it; the id is `diffTabId`'s).
        const {t} = useNuxtApp().$i18n
        context.views.tabKind({
            kind: 'git-diff',
            describe(id) {
                const spec = diffSpecOf(id)
                return spec && {label: diffTitle(spec, t), icon: 'i-lucide-git-compare'}
            },
            component: () => import('./components/DiffView.vue'),
        })
        context.settings.page({id: 'git', label: 'plugins.git.nav', component: () => import('./components/Settings.vue')})
        // Clicks run outside the Nuxt app's context; `cloneWorkspace` needs it for `useOverlay`.
        const nuxtApp = useNuxtApp()
        context.home.action({id: 'clone-workspace', label: 'plugins.git.cloneWorkspace', icon: 'i-lucide-folder-git-2', run: home => nuxtApp.runWithContext(() => cloneWorkspace(home))})
        // Whether the workspace is a git repository (for the History view), and auto-sync when it's on.
        context.onSession(session => {
            if (!session.session.workspaceSession) return
            watchGitPresence(session)
            useGitAutoSync(session)
        })
    },
})

/** Clones a repository into a new folder (`GitCloneModal`) and opens it as a workspace. */
async function cloneWorkspace(home: HomeActionContext) {
    const path = await useOverlay().create(GitCloneModal, {destroyOnClose: true}).open().result
    if (path) await home.openWorkspace(path)
}
