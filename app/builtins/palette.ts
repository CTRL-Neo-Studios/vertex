import type {PanelActionContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import {sessionScope, StateKey} from '#shared/constants/app'
import {panelViews} from '~/utils/panelViews'

/** The search of the view shown beside the Search button, when it has its own (`PanelViewDef.search`). */
const shownSearch = ({shown}: PanelActionContext) => (shown === undefined ? undefined : panelViews.get(shown)?.search)

export default definePlugin({
    setup(ctx) {
        ctx.views.panel({
            id: 'search', label: 'app.chat.search', icon: 'i-lucide-search', defaultArea: 'left',
            when: c => c.isWorkspace,
            // The shown view's own search, else the palette's file search.
            action: c => {
                const search = shownSearch(c)
                if (search) return search(c)
                useState<boolean>(StateKey.fileSearchOpen(sessionScope(c.session, 'search')), () => false).value = true
            },
            kbds: c => (shownSearch(c) ? undefined : ['meta', 'p']),
        })
    },
})
