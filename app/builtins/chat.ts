import {h} from 'vue'
import type {PanelViewContext, TabProps} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import {pluginStateKey, sessionScope} from '#shared/constants/app'
import {useActiveWorkspaceIndex} from '~/composables/active/useActiveWorkspaceIndex'
import {aiFeatureOn} from '~/composables/ai/useAiConfig'
import {chatSummaryOf, useChats} from '~/composables/ai/useChats'
import {useChatActions} from '~/composables/ai/useChatActions'
import {useSettingsScope} from '~/composables/app/useSettingsScope'
import {chatChangeOf} from '~/utils/chatChanges'
import {pluginSession} from '~/utils/plugins/runtime'

const chatOn = (c: PanelViewContext) => c.isWorkspace && aiFeatureOn(c.settings?.aiConfig, 'chat')

export default definePlugin({
    setup(ctx) {
        ctx.views.panel({
            id: 'chats', label: 'app.chat.chats', icon: 'i-lucide-messages-square', defaultArea: 'left',
            when: chatOn,
            // Search beside the Chats view searches chats.
            search: ({session}) => {
                useState<boolean>(pluginStateKey('chat', 'search-open', sessionScope(session, 'search')), () => false).value = true
            },
            component: () => import('~/components/Chat/ChatsPanel.vue'),
        })
        ctx.views.panel({
            id: 'chat', label: 'app.chat.chat', icon: 'i-lucide-message-square', defaultArea: 'right',
            when: chatOn,
            component: () => import('~/components/Chat/ChatSidePanelView.vue'),
        })
        const {t} = useNuxtApp().$i18n
        // A chat in a tab (the id is the chat's), reopened after a relaunch.
        ctx.views.tabKind({
            kind: 'chat',
            describe(id) {
                const session = pluginSession()?.session
                return {label: (session && chatSummaryOf(session, id)?.title) || t('app.chat.untitled'), icon: 'i-lucide-message-square'}
            },
            persist: true,
            // ChatView takes the chat as `chatId`, as the Chat view draws it too.
            component: async () => {
                const {default: ChatView} = await import('~/components/Chat/ChatView.vue')
                return (props: TabProps) => h(ChatView, {chatId: props.id})
            },
        })
        // A Write-mode change's diff (`useChats.openChange`; the id is `chatChangeTabId`'s).
        ctx.views.tabKind({
            kind: 'chat-change',
            describe(id) {
                const change = chatChangeOf(id)
                return change && {label: t('app.chat.changes.tabTitle', {name: change.path.slice(change.path.lastIndexOf('/') + 1)}), icon: 'i-lucide-sparkles'}
            },
            component: () => import('~/components/Chat/ChatChangeView.vue'),
        })
        // Chats synced in from elsewhere (`chats` index events): one refresh per burst.
        ctx.onSession(({session}) => {
            if (!session.workspaceSession) return
            const {syncExternal} = useChats(session)
            const changed = new Set<string>()
            const flush = useDebounceFn(() => {
                const paths = [...changed]
                changed.clear()
                return syncExternal(paths)
            }, 500)
            onScopeDispose(useActiveWorkspaceIndex(session).on(event => {
                if (event.type !== 'chats') return
                changed.add(event.path)
                void flush()
            }))
        })
        // File → New Chat: opens it in a tab; a locked vault or a failure shows as a toast (useChatActions.run).
        ctx.onSession(({session}) => {
            if (!session.workspaceSession) return
            const {newChat} = useChatActions(session)
            const {effective} = useSettingsScope()
            ctx.commands.register({
                id: 'new',
                label: 'app.commands.newChat',
                accelerator: 'CmdOrCtrl+Shift+L',
                menu: {section: 'file', group: 0},
                enabled: () => aiFeatureOn(effective.value?.aiConfig, 'chat'),
                run: () => newChat(),
            })
        })
    },
})
