import {Chat} from "@ai-sdk/vue";
import {invoke} from "@tauri-apps/api/core";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ChatFile, ChatIndex, ChatStorage, ChatSummary, ChatVaultState, VertexChatMessage} from "#shared/types/app/chats";
import {sessionScope, StateKey} from "#shared/constants/app";
import {isPlainTextFile} from "#shared/utils/fs/filenames";
import {ChatError, chatClient} from "~/utils/chatClient";
import {chatSystem, createChatTransport, generateChatTitle, type ChatSendSetup} from "~/utils/chatTransport";
import {resolveAiFeature} from "~/composables/ai/useAiConfig";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";

/** Thrown by `send` when the chat feature is off or has no model. The message is an i18n key. */
export const CHAT_NO_MODEL = 'app.chat.noModel'

interface LiveChat {
    chat: Chat<VertexChatMessage>
    /** The file without its messages (those live in `chat`); reactive, for `profileId`. */
    meta: Omit<ChatFile, 'messages'>
    /** Where it was read from: a later storage switch doesn't move it. */
    root: string
    storage: ChatStorage
    /** Saves run one after another, so an older write never lands last. */
    saving: Promise<void>
}

/**
 * Loaded chats, keyed `${scope}:${id}`. `Chat` isn't serializable, so they live here and not in `useState` (like
 * `runtimes` in useActiveWorkspaceIndex). `loading` dedupes concurrent loads; `live` holds the loaded ones.
 */
const loading = new Map<string, Promise<LiveChat>>()
const live = shallowReactive(new Map<string, LiveChat>())
/** The last failed save per loaded chat (same keys), cleared by the next successful one. Shown in ChatView. */
const saveErrors = shallowReactive(new Map<string, string>())

const parentsOf = (path: string) => path.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
const inFolder = (folder: string, path: string) => folder === path || folder.startsWith(`${path}/`)

/**
 * A workspace's chats (Rust stores them; see chatClient). Unavailable (`root` null) in singlespace sessions.
 * Mutations throw Rust's error strings (`ChatError`); `refresh` puts its error in `error` instead.
 */
export function useChats(session?: ActiveSession) {
    const scope = sessionScope(session, 'useChats')
    const nuxtApp = useNuxtApp()
    const {effective} = useSettingsScope()
    const $tabs = useActiveTabs(session)
    const $index = useActiveWorkspaceIndex(session)
    const {rightPanelCollapsed, rightPanelView} = useActiveLayouts(session)
    const $navi = useAppNavigator()

    const root = computed(() => session?.workspaceSession && session.rootPath ? session.rootPath : null)
    const storage = computed<ChatStorage>(() => effective.value?.aiConfig.chatStorage ?? 'app')
    const vault = useState<ChatVaultState | null>(StateKey.chatVault(scope), () => null)
    const index = useState<ChatIndex | null>(StateKey.chatIndex(scope), () => null)
    const error = useState<string | null>(StateKey.chatError(scope), () => null)
    const sidePanelChatId = useState<string | null>(StateKey.chatSidePanel(scope), () => null)
    /** Text and notes for a chat's prompt, put there by `askInChat` and taken by that chat's ChatView. */
    const pendingPrompt = useState<{ chatId: string, text: string, notes: string[] } | null>(StateKey.chatPrompt(scope), () => null)

    const keyOf = (id: string) => `${scope}:${id}`
    const ownLive = () => [...live].filter(([key]) => key.startsWith(`${scope}:`))

    function requireRoot() {
        if (!root.value) throw new Error('[useChats] chats need a workspace session')
        return root.value
    }

    async function refresh() {
        const r = root.value
        if (!r) return
        const s = storage.value
        try {
            const state = await chatClient.vaultState(r, s)
            const next = state === 'open' || state === 'unlocked' ? await chatClient.index(r, s) : null
            vault.value = state
            index.value = next
            error.value = null
        } catch (e) {
            index.value = null
            error.value = String(e)
        }
    }

    async function createVault(password: string, remember: boolean) {
        await chatClient.vaultCreate(requireRoot(), password, remember)
        await refresh()
    }

    async function unlock(password: string, remember: boolean) {
        await chatClient.vaultUnlock(requireRoot(), password, remember)
        await refresh()
    }

    async function lock() {
        await chatClient.vaultLock(requireRoot())
        // The decrypted workspace chats go with the key.
        for (const [key, c] of ownLive()) if (c.storage === 'workspace') forget(key)
        await refresh()
    }

    /**
     * `.vertex/chats/` changed outside Vertex (sync from another device): re-read the index, and reload each loaded
     * chat whose file is newer than ours, unless it's replying. `paths` are the changed files (`<id>.chat`).
     */
    async function syncExternal(paths: string[]) {
        if (storage.value !== 'workspace') return
        await refresh()
        for (const path of paths) {
            const name = path.slice(path.lastIndexOf('/') + 1)
            const entry = name.endsWith('.chat') ? live.get(keyOf(name.slice(0, -'.chat'.length))) : undefined
            if (!entry || entry.storage !== 'workspace' || entry.root !== root.value) continue
            if (entry.chat.status === 'submitted' || entry.chat.status === 'streaming') continue
            try {
                const {messages, ...meta} = await chatClient.read(entry.root, entry.storage, entry.meta.id)
                // Our own saves come back with the same `updated`.
                if (meta.updated <= entry.meta.updated) continue
                Object.assign(entry.meta, meta)
                entry.chat.messages = messages
            } catch {
                // ponytail: deleted or locked elsewhere; the refreshed list shows it, an open tab keeps its copy.
            }
        }
    }

    const summary = (id: string) => computed(() => index.value?.chats.find(c => c.id === id))
    const profileId = (id: string) => computed(() => live.get(keyOf(id))?.meta.profileId)
    const saveError = (id: string) => computed(() => saveErrors.get(keyOf(id)))

    /** Mirrors a saved chat into the index, when the index shows the place it was saved to. */
    function upsert(entry: LiveChat) {
        const chats = index.value?.chats
        if (!chats || entry.root !== root.value || entry.storage !== storage.value) return
        const {id, title, folder, created, updated} = entry.meta
        const next: ChatSummary = {id, title, folder, created, updated}
        const i = chats.findIndex(c => c.id === id)
        if (i === -1) chats.push(next)
        else chats[i] = next
    }

    function save(entry: LiveChat): Promise<void> {
        const key = keyOf(entry.meta.id)
        const write = () => {
            entry.meta.updated = Date.now()
            return chatClient.write(entry.root, entry.storage, {...toRaw(entry.meta), messages: entry.chat.messages})
        }
        entry.saving = entry.saving.then(write, write).then(() => {
            saveErrors.delete(key)
            upsert(entry)
        }, (e: unknown) => {
            saveErrors.set(key, e instanceof Error ? e.message : String(e))
            throw e
        })
        return entry.saving
    }

    /** Writes a loaded chat again (after a failed save); throws like any save. */
    async function retrySave(id: string) {
        const entry = live.get(keyOf(id))
        if (entry) await save(entry)
    }

    const saveLogged = (entry: LiveChat) => save(entry).catch(e => console.error(`[useChats] could not save chat ${entry.meta.id}`, e))

    /** The pinned profile while it's still usable, else the chat feature's. */
    function resolveModel(pinned: string | undefined) {
        const ai = effective.value?.aiConfig
        if (!ai || ai.features.chat === '') throw new Error(CHAT_NO_MODEL)
        const profile = ai.modelProfiles.find(p => p.id === pinned)
        const provider = profile && ai.providers.find(p => p.id === profile.providerId)
        const resolved = profile?.modelId && provider ? {profile, provider} : resolveAiFeature(ai, 'chat')
        if (!resolved) throw new Error(CHAT_NO_MODEL)
        return resolved
    }

    /** The active tab's note (live buffer), then every note attached in the conversation. */
    async function notesFor(messages: VertexChatMessage[]) {
        const notes: {path: string, content: string}[] = []
        const tab = $tabs.getActiveTab($tabs.activeTabUuid.value)
        const file = tab && tab.kind !== 'chat' ? $index.getFileByUuid(tab.fileUuid) : null
        const open = file && isPlainTextFile(file.fileExt) ? file : null
        if (tab && open) {
            const content = await nuxtApp.runWithContext(() => useActiveEditorContent(session, tab).content.value)
            notes.push({path: open.relativePath, content})
        }
        const attached = new Set(messages.flatMap(m => m.metadata?.notes ?? []))
        if (open) attached.delete(open.relativePath)
        const files = $index.getFilteredFiles(f => !f.isFolder && attached.has(f.relativePath))
        if (files.length === 0) return notes
        const relative = new Map(files.map(f => [f.fullPath, f.relativePath]))
        const read = await invoke<{path: string, content?: string}[]>('read_text_files_batch', {paths: [...relative.keys()]})
        for (const r of read) {
            const path = relative.get(r.path)
            if (path && r.content !== undefined) notes.push({path, content: r.content})
        }
        return notes
    }

    async function setupFor(entry: LiveChat, messages: VertexChatMessage[]): Promise<ChatSendSetup> {
        const {profile, provider} = resolveModel(entry.meta.profileId)
        // Every send starts here, right after the user message was added.
        void saveLogged(entry)
        return {provider, modelId: profile.modelId, system: chatSystem(profile.systemPrompt, await notesFor(messages))}
    }

    const firstLineTitle = (text: string) => text.trim().slice(0, 60)
    const textOf = (m: VertexChatMessage) => m.parts.map(p => p.type === 'text' ? p.text : '').join('')

    /** After the first reply: the chat's model names it, unless the title was changed from the first message's. */
    async function autoTitle(entry: LiveChat) {
        const [question, answer, ...later] = entry.chat.messages
        if (later.length || question?.role !== 'user' || answer?.role !== 'assistant') return
        const initial = firstLineTitle(textOf(question))
        if (entry.meta.title !== initial) return
        try {
            const {profile, provider} = resolveModel(entry.meta.profileId)
            const title = await generateChatTitle(provider, profile.modelId, textOf(question), textOf(answer))
            // Renamed while the model was answering: the user's name wins.
            if (!title || entry.meta.title !== initial) return
            entry.meta.title = title
            await save(entry)
        } catch (e) {
            // A failed title keeps the first message's; nothing to show for it.
            console.warn(`[useChats] no title for chat ${entry.meta.id}`, e)
        }
    }

    function load(id: string): Promise<LiveChat> {
        const key = keyOf(id)
        const pending = loading.get(key)
        if (pending) return pending
        const r = requireRoot()
        const s = storage.value
        const next = chatClient.read(r, s, id).then(({messages, ...meta}) => {
            const state = {meta: reactive(meta), root: r, storage: s, saving: Promise.resolve()}
            const chat = new Chat<VertexChatMessage>({
                id,
                messages,
                transport: createChatTransport(m => setupFor(entry, m)),
                onFinish: ({isAbort, isError}) => {
                    void saveLogged(entry)
                    if (!isAbort && !isError) void autoTitle(entry)
                },
            })
            const entry: LiveChat = Object.assign(state, {chat})
            live.set(key, entry)
            return entry
        })
        next.catch(() => loading.delete(key))
        loading.set(key, next)
        return next
    }

    function forget(key: string) {
        void live.get(key)?.chat.stop()
        live.delete(key)
        loading.delete(key)
        saveErrors.delete(key)
    }

    async function liveChat(id: string) {
        return (await load(id)).chat
    }

    async function createChat(folder = ''): Promise<ChatSummary> {
        const now = Date.now()
        const file: ChatFile = {version: 1, id: crypto.randomUUID(), title: '', folder, created: now, updated: now, messages: []}
        await chatClient.write(requireRoot(), storage.value, file)
        const {id, title, created, updated} = file
        const next: ChatSummary = {id, title, folder, created, updated}
        index.value?.chats.push(next)
        return next
    }

    async function update(id: string, patch: Partial<Pick<ChatFile, 'title' | 'folder' | 'profileId'>>) {
        const entry = await load(id)
        Object.assign(entry.meta, patch)
        await save(entry)
    }

    async function send(id: string, text: string, notes: string[]) {
        const entry = await load(id)
        resolveModel(entry.meta.profileId)
        if (!entry.meta.title) entry.meta.title = firstLineTitle(text)
        await entry.chat.sendMessage({text, metadata: {notes, createdAt: Date.now()}})
    }

    /** Closes the chat's tab; if it was the shown one, shows the next. */
    async function closeChatTab(id: string) {
        if (!$tabs.isTabOpened(id)) return
        const wasActive = $tabs.activeTabUuid.value === id
        $tabs.closeTab(id)
        if (wasActive) await $navi.toWorkspaceTab(session?.uuid, $tabs.getActiveTab($tabs.activeTabUuid.value))
    }

    function drop(ids: string[]) {
        for (const id of ids) {
            forget(keyOf(id))
            if (sidePanelChatId.value === id) sidePanelChatId.value = null
            void closeChatTab(id)
        }
        if (index.value) index.value.chats = index.value.chats.filter(c => !ids.includes(c.id))
    }

    async function deleteChat(id: string) {
        await chatClient.delete(requireRoot(), storage.value, id)
        drop([id])
    }

    async function createFolder(path: string) {
        const current = index.value
        // Replacing the folder list without having read it would drop the stored ones.
        if (!current) throw new Error(ChatError.locked)
        const folders = [...new Set([...current.folders, ...parentsOf(path)])].sort()
        await chatClient.foldersSet(requireRoot(), storage.value, folders)
        current.folders = folders
    }

    async function renameFolder(from: string, to: string) {
        const s = storage.value
        await chatClient.folderRename(requireRoot(), s, from, to)
        // Loaded chats would write their old folder back on the next save.
        for (const [, c] of ownLive()) {
            if (c.storage === s && inFolder(c.meta.folder, from)) c.meta.folder = to + c.meta.folder.slice(from.length)
        }
        index.value = await chatClient.index(requireRoot(), s)
    }

    async function deleteFolder(path: string) {
        await chatClient.folderDelete(requireRoot(), storage.value, path)
        drop(index.value?.chats.filter(c => inFolder(c.folder, path)).map(c => c.id) ?? [])
        index.value = await chatClient.index(requireRoot(), storage.value)
    }

    function showInSidePanel(id: string) {
        sidePanelChatId.value = id
        rightPanelCollapsed.value = false
        rightPanelView.value = '4'
        void closeChatTab(id)
    }

    async function openInTab(id: string) {
        if (sidePanelChatId.value === id) sidePanelChatId.value = null
        await $navi.toWorkspaceTab(session?.uuid, $tabs.openTab(id, 'chat'))
    }

    /** Shows the side-panel chat (a new one when none is there) with `quote` quoted in its prompt and `note` attached. */
    async function askInChat(quote: string, note: string) {
        if (!index.value) await refresh()
        const shown = sidePanelChatId.value
        const id = shown && index.value?.chats.some(c => c.id === shown) ? shown : (await createChat()).id
        pendingPrompt.value = {chatId: id, text: `${quote.split('\n').map(line => `> ${line}`).join('\n')}\n\n`, notes: [note]}
        showInSidePanel(id)
    }

    return {
        root,
        storage,
        vault,
        index,
        error,
        refresh,
        syncExternal,
        createVault,
        unlock,
        lock,
        summary,
        profileId,
        saveError,
        retrySave,
        createChat,
        renameChat: (id: string, title: string) => update(id, {title}),
        moveChat: (id: string, folder: string) => update(id, {folder}),
        deleteChat,
        createFolder,
        renameFolder,
        deleteFolder,
        /** Searches the saved chats' message text (in Rust, so decrypted chats never leave it in bulk). */
        search: (query: string) => chatClient.search(requireRoot(), storage.value, query),
        liveChat,
        send,
        setProfile: (id: string, profileId: string | undefined) => update(id, {profileId}),
        sidePanelChatId,
        showInSidePanel,
        openInTab,
        askInChat,
        pendingPrompt,
    }
}
