import {h} from 'vue'
import type {PanelViewContext, PluginApis, PluginContext, TabProps} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import {pluginStateKey, sessionScope} from '#shared/constants/app'
import {chatSummaryOf, useChats} from '~/composables/ai/useChats'
import {useChatActions} from '~/composables/ai/useChatActions'
import {chatChangeOf} from '~/utils/chatChanges'
import {pluginSession} from '~/utils/plugins/runtime'

let use: PluginContext['use'] | undefined
/** Another plugin's API while that plugin is on, for chat's code (its models are AI's; replies draw ```mermaid with mermaid's). */
export const chatUses = <K extends keyof PluginApis>(id: K) => use?.(id)

/** Whether AI is on and chat with it (chat requires AI, so its API is there while chat runs). */
const chatOn = () => !!chatUses('ai')?.featureOn('chat')
const chatViewOn = (c: PanelViewContext) => c.isWorkspace && chatOn()

export default definePlugin({
    setup(ctx) {
        use = ctx.use
        ctx.use('ai')?.registerFeature({id: 'chat', label: 'app.aiFeatures.chat', description: 'app.aiFeatures.chatDescription'})
        ctx.views.panel({
            id: 'chats', label: 'app.chat.chats', icon: 'i-lucide-messages-square', defaultArea: 'left',
            when: chatViewOn,
            // Search beside the Chats view searches chats.
            search: ({session}) => {
                useState<boolean>(pluginStateKey('chat', 'search-open', sessionScope(session, 'search')), () => false).value = true
            },
            component: () => import('~/components/Chat/ChatsPanel.vue'),
        })
        ctx.views.panel({
            id: 'chat', label: 'app.chat.chat', icon: 'i-lucide-message-square', defaultArea: 'right',
            when: chatViewOn,
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
        // Chats synced in from elsewhere (the index ignores `.vertex/`): one refresh per burst.
        ctx.onSession(({session, watch: watchUnder}) => {
            if (!session.workspaceSession) return
            const {syncExternal} = useChats(session)
            const changed = new Set<string>()
            const flush = useDebounceFn(() => {
                const paths = [...changed]
                changed.clear()
                return syncExternal(paths)
            }, 500)
            watchUnder('.vertex/chats/', (paths) => {
                for (const path of paths) changed.add(path)
                void flush()
            })
        })
        // File → New Chat: opens it in a tab; a locked vault or a failure shows as a toast (useChatActions.run).
        ctx.onSession(({session}) => {
            if (!session.workspaceSession) return
            const {newChat} = useChatActions(session)
            ctx.commands.register({
                id: 'new',
                label: 'app.commands.newChat',
                accelerator: 'CmdOrCtrl+Shift+L',
                menu: {section: 'file', group: 0},
                enabled: chatOn,
                run: () => newChat(),
            })
        })
        // Ask in chat in the note's right-click menu: the selection, quoted with the note, into the chat's prompt.
        ctx.onSession(({session}) => {
            if (!session.workspaceSession) return
            const {root, askInChat} = useChats(session)
            ctx.editor.noteMenuItem({
                id: 'ask-in-chat',
                items: ({host, selection}) => (root.value && chatOn() ? [{
                    label: t('app.editor.ui.askInChat'), icon: 'i-lucide-message-square-quote', disabled: !selection,
                    onSelect: () => askInChat(selection, host.notePath),
                }] : []),
            })
        })
    },
})
