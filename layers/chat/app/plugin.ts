import {h} from 'vue'
import type {PanelViewContext, PluginContext, SessionContext, TabProps} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import type {ChatConfig} from '../shared/types'
import type {ChatApi} from './api'
import {chatSummaryOf, stateKey, useChats} from './lib/chats'
import {useChatActions} from './lib/actions'
import {chatChangeOf} from './lib/changes'

let ctx: PluginContext<ChatConfig> | undefined
/**
 * The plugin's context, for its components and lib (they work only while it runs): its config, and other plugins'
 * APIs (its models are AI's; replies draw ```mermaid with mermaid's; `runWorkflow` runs workflows').
 */
export const chatContext = () => ctx!

let session: SessionContext | undefined
/**
 * This window's session, for the components inside chat's views (the views and tabs get it as their `session` prop);
 * `undefined` until it starts and after it ends.
 */
export const chatSession = () => session

/** Whether AI is on and chat with it (chat requires AI, so its API is there while chat runs). */
const chatOn = () => !!ctx?.use('ai')?.featureOn('chat')
const chatViewOn = (c: PanelViewContext) => c.isWorkspace && chatOn()

export default definePlugin<ChatConfig>({
    setup(context) {
        ctx = context
        context.use('ai')?.registerFeature({id: 'chat', label: 'plugins.chat.feature.label', description: 'plugins.chat.feature.description'})
        context.provide({chatsInWorkspace: () => context.config.value.storage === 'workspace'} satisfies ChatApi)
        // Tool feedback (`toolFeedback`), kept on this computer for the user to review.
        context.settings.page({id: 'chat', label: 'plugins.chat.settings.nav', component: () => import('./components/Settings.vue')})
        context.views.panel({
            id: 'chats', label: 'plugins.chat.chats', icon: 'i-lucide-messages-square', defaultArea: 'left',
            when: chatViewOn,
            // Search beside the Chats view searches chats.
            search: ({session}) => {
                if (session) useState<boolean>(stateKey('search-open', session.uuid), () => false).value = true
            },
            component: () => import('./components/ListPanel.vue'),
        })
        context.views.panel({
            id: 'chat', label: 'plugins.chat.chat', icon: 'i-lucide-message-square', defaultArea: 'right',
            when: chatViewOn,
            component: () => import('./components/SidePanelView.vue'),
        })
        const {t} = useNuxtApp().$i18n
        // A chat in a tab (the id is the chat's), reopened after a relaunch.
        context.views.tabKind({
            kind: 'chat',
            describe(id) {
                return {label: (session && chatSummaryOf(session, id)?.title) || t('plugins.chat.untitled'), icon: 'i-lucide-message-square'}
            },
            persist: true,
            // ChatView takes the chat as `chatId`, as the Chat view draws it too.
            component: async () => {
                const {default: ChatView} = await import('./components/View.vue')
                return (props: TabProps) => h(ChatView, {chatId: props.id})
            },
        })
        // A Write-mode change's diff (`useChats.openChange`; the id is `chatChangeTabId`'s).
        context.views.tabKind({
            kind: 'chat-change',
            describe(id) {
                const change = chatChangeOf(id)
                return change && {label: t('plugins.chat.changes.tabTitle', {name: change.path.slice(change.path.lastIndexOf('/') + 1)}), icon: 'i-lucide-sparkles'}
            },
            component: () => import('./components/ChangeView.vue'),
        })
        context.onSession((s) => {
            session = s
            onScopeDispose(() => {
                if (session === s) session = undefined
            })
            if (!s.session.workspaceSession) return
            const {root, syncExternal, askInChat} = useChats(s)
            // Chats synced in from elsewhere (the index ignores `.vertex/`): one refresh per burst.
            const changed = new Set<string>()
            const flush = useDebounceFn(() => {
                const paths = [...changed]
                changed.clear()
                return syncExternal(paths)
            }, 500)
            s.watch('.vertex/chats/', (paths) => {
                for (const path of paths) changed.add(path)
                void flush()
            })
            // File → New Chat: opens it in a tab; a locked vault or a failure shows as a toast (useChatActions.run).
            const {newChat} = useChatActions(s)
            context.commands.register({
                id: 'new',
                label: 'plugins.chat.commandNewChat',
                accelerator: 'CmdOrCtrl+Shift+L',
                menu: {section: 'file', group: 0},
                enabled: chatOn,
                run: () => newChat(),
            })
            // Ask in chat in the note's right-click menu: the selection, quoted with the note, into the chat's prompt.
            context.editor.noteMenuItem({
                id: 'ask-in-chat',
                items: ({host, selection}) => (root.value && chatOn() ? [{
                    label: t('plugins.chat.askInChat'), icon: 'i-lucide-message-square-quote', disabled: !selection,
                    onSelect: () => askInChat(selection, host.notePath),
                }] : []),
            })
        })
    },
})
