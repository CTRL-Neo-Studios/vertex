import {Chat} from "@ai-sdk/vue";
import {getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls} from "ai";
import {aiField, discardProposal, isEditorTool, runEditorTool} from "@type32/codemirror-rich-obsidian-editor/ext/ai";
import {CompileError} from "@type32/workflows/core";
import {invoke} from "@tauri-apps/api/core";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveTab} from "#shared/types/active/tabs";
import type {ChatChange, ChatFile, ChatIndex, ChatMode, ChatScope, ChatStorage, ChatSummary, ChatVaultState, VertexChatMessage} from "#shared/types/app/chats";
import {sessionScope, StateKey} from "#shared/constants/app";
import {fileNameFromPath, isPlainTextFile, isWorkflowFile} from "#shared/utils/fs/filenames";
import {toChatMode} from "#shared/utils/defaults/apps";
import {ChatError, chatClient} from "~/utils/chatClient";
import {createChatTransport, generateChatTitle, type ChatSendSetup} from "~/utils/chatTransport";
import {ASK_USER, chatTools, inScope, modeError, scopeText, toolsPrompt, usedToolNames, type AskUserOutput, type NamedNotes} from "~/utils/chatTools";
import {fetchPage} from "~/utils/webPage";
import {branchAt, fork, pruneForks, switchBranch} from "~/utils/chatForks";
import {changesSummary, chatChangeTabId, newNotePath, textChange} from "~/utils/chatChanges";
import {createSandbox, runCommand, sandboxWrites, WORKSPACE, type Sandbox} from "~/utils/chatBash";
import {TRASH_DIR} from "#shared/workflows/vault";
import type {Op} from "#shared/workflows/effects";
import {useWorkspaceVault} from "~/composables/workflows/useWorkspaceVault";
import {parseWorkflow, useWorkflowRunner, type WorkflowRunner} from "~/composables/workflows/useWorkflowRunner";
import {resolveAiFeature} from "~/composables/ai/useAiConfig";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {usePanels} from "~/composables/active/usePanels";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import {editorViewOf, editorViewsOf, lastShownNoteOf} from "~/composables/active/editor/useActiveEditorExtensions";
import {until} from "@vueuse/core";

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
    /** The profile the next new reply uses instead of the chat's, once (a retry's pick). */
    retryProfileId?: string
    /** Write mode: what the reply being written has staged so far, by path; kept on the reply when it ends. */
    staging?: Map<string, ChatChange>
    /** The reply's `bash` sandbox, made on its first command; a new reply starts a fresh one (notes may have changed). */
    sandbox?: Promise<Sandbox>
}

/**
 * Loaded chats, keyed `${scope}:${id}`. `Chat` isn't serializable, so they live here and not in `useState` (like
 * `runtimes` in useActiveWorkspaceIndex). `loading` dedupes concurrent loads; `live` holds the loaded ones.
 */
const loading = new Map<string, Promise<LiveChat>>()
const live = shallowReactive(new Map<string, LiveChat>())
/** The last failed save per loaded chat (same keys), cleared by the next successful one. Shown in ChatView. */
const saveErrors = shallowReactive(new Map<string, string>())
/** A session's workflow runner, for `runWorkflow` (its modals and toasts are app-wide), made on first use. */
const runners = new Map<string, WorkflowRunner>()

const parentsOf = (path: string) => path.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
const inFolder = (folder: string, path: string) => folder === path || folder.startsWith(`${path}/`)

/** A workflow run's change, in a few words for the model. */
const opText = (op: Op) => op.kind === 'move' ? `${op.why}: "${op.from}" → "${op.to}"` : `${op.kind === 'create' ? `new ${op.why}` : op.why}: "${op.path}"`

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
    const panels = usePanels(session)
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

    const slashed = (path: string) => path.replace(/\\/g, '/')
    const noteFiles = () => $index.getFilteredFiles(f => !f.isFolder && isPlainTextFile(f.fileExt))

    /**
     * The note the editor tools work on: the shown note; from a chat tab, the note shown last, while its tab is open.
     */
    function editTarget() {
        const tab = $tabs.getActiveTab($tabs.activeTabUuid.value)
        if (tab && tab.kind !== 'chat') return editorViewOf(session, tab.fileUuid) ? tab.fileUuid : undefined
        const last = lastShownNoteOf(session)
        return last && $tabs.isTabOpened(last) ? last : undefined
    }

    /**
     * Shows `tab` with the chat beside it: a chat in a tab moves to the side panel (with the Chat view hidden it keeps
     * its tab), and `tab` shows in the editor area.
     */
    async function showBeside(chatId: string, tab: ActiveTab) {
        sidePanelChatId.value = chatId
        const beside = panels.showView('chat')
        // The tab's route first, then the chat's tab goes (see closeTabElsewhere).
        await $navi.toWorkspaceTab(session?.uuid, tab)
        if (beside && $tabs.isTabOpened(chatId)) $tabs.closeTab(chatId)
    }

    /**
     * The note's editor, shown with the chat beside it (`showBeside`), so its proposals can be seen and decided. Waits
     * for the editor to mount; `undefined` if it doesn't.
     */
    async function editorFor(chatId: string, noteId: string) {
        const shown = editorViewOf(session, noteId)
        if (shown && $tabs.activeTabUuid.value === noteId) return shown
        await showBeside(chatId, $tabs.openTab(noteId))
        return until(() => editorViewOf(session, noteId)).toBeTruthy({timeout: 10_000, throwOnTimeout: false})
    }

    /** A Write-mode change's diff tab (`ChatChangeView`), with the chat beside it. */
    const openChange = (chatId: string, messageId: string, path: string) =>
        showBeside(chatId, $tabs.openTab(chatChangeTabId({chatId, messageId, path}), 'diff'))

    /** A note by workspace-relative path or, as models often pass, by name (like a wikilink: any case, `.md` optional). */
    function findNote(path: string) {
        const files = noteFiles()
        const name = path.toLowerCase().replace(/\.(md|txt)$/, '')
        return files.find(f => slashed(f.relativePath) === path)
            ?? files.find(f => slashed(f.relativePath).toLowerCase().replace(/\.(md|txt)$/, '') === name)
            ?? files.find(f => fileNameFromPath(f.fileName, true).toLowerCase() === name)
    }

    /** A note's text for `readNote` (see `findNote`): its mounted editor's buffer, else the file. */
    async function readNote(path: string) {
        const file = findNote(path)
        if (!file) return null
        const view = editorViewOf(session, file.uuid)
        if (view) return view.state.doc.toString()
        const [read] = await invoke<{path: string, content?: string}[]>('read_text_files_batch', {paths: [file.fullPath]})
        return read?.content ?? null
    }

    /** `openInEditorTab`: the note (see `findNote`) shown in its tab, with the chat beside it. Worded for the model. */
    async function openInEditor(chatId: string, path: string): Promise<object> {
        const file = findNote(path)
        if (!file) return {error: `There's no note at "${path}". Use searchNotes or findFiles for its path.`}
        return await editorFor(chatId, file.uuid) ? {path: slashed(file.relativePath), opened: true} : {error: 'The note could not be shown in the editor.'}
    }

    const defaultMode = (): ChatMode => toChatMode(effective.value?.aiConfig.chatMode)
    const modeOf = (entry: LiveChat) => entry.meta.mode ?? defaultMode()

    /** Every file and folder in the workspace but dot-named ones (and what's in them), for `findFiles`. */
    const workspaceFiles = () => $index.getFilteredFiles(f => !slashed(f.relativePath).split('/').some(part => part.startsWith('.')))
        .map(f => ({path: slashed(f.relativePath), kind: f.isFolder ? 'folder' : f.fileExt.toLowerCase()}))
        .sort((a, b) => a.path.localeCompare(b.path))

    /**
     * `runWorkflow`: the workflow at `path` (or by name) on `note` (else the open note), through the session's runner:
     * a real run asks for trust when it isn't trusted, and ends in its toast with Undo. Worded for the model.
     */
    async function runWorkflow(path: string, note: string | undefined, dry: boolean): Promise<object> {
        const name = path.toLowerCase().replace(/\.workflow$/, '')
        const file = $index.getFilteredFiles(f => !f.isFolder && isWorkflowFile(f.fileExt)).find(f => slashed(f.relativePath) === path
            || slashed(f.relativePath).toLowerCase().replace(/\.workflow$/, '') === name || fileNameFromPath(f.fileName, true).toLowerCase() === name)
        if (!file) return {error: `There's no workflow at "${path}". List them with findFiles, extension "workflow".`}
        const at = slashed(file.relativePath)
        const open = editTarget()
        const on = note ? findNote(note)?.relativePath ?? note : open && $index.getFileByUuid(open)?.relativePath
        const label = fileNameFromPath(file.fileName, true)
        let runner = runners.get(session!.uuid)
        if (!runner) runners.set(session!.uuid, runner = await nuxtApp.runWithContext(() => useWorkflowRunner(session!)))
        try {
            const {doc, problems} = parseWorkflow(await (await vaultOf()).read(at))
            if (!doc) return {error: `"${at}" isn't a valid workflow: ${problems[0]?.message ?? 'unreadable'}`}
            const context = {note: on && slashed(on)}
            const outcome = dry ? await runner.dryRun(doc, label, context) : await runner.run(doc, label, at, context)
            if (!outcome) return {declined: true, reason: 'The user didn\'t trust the workflow.'}
            if (!dry) runner.report(label, outcome)
            const {status, steps, fault} = outcome.result
            return {
                status,
                steps,
                ...(fault && {fault: fault.message}),
                [dry ? 'wouldChange' : 'changed']: outcome.ops.slice(0, 50).map(opText),
                ...(outcome.ops.length > 50 && {more: outcome.ops.length - 50}),
            }
        } catch (e) {
            return {error: e instanceof CompileError ? e.diagnostics[0]?.message ?? e.message : e instanceof Error ? e.message : String(e)}
        }
    }

    /**
     * The notes the named scope covers: the open one, every note and folder attached in the conversation, and the notes
     * it created (staged in Write mode, including the reply being written).
     */
    function namedNotes(messages: VertexChatMessage[], staging?: Map<string, ChatChange>): NamedNotes {
        const open = editTarget()
        const openPath = open && $index.getFileByUuid(open)?.relativePath
        const created = [...messages.flatMap(m => m.metadata?.changes ?? []), ...(staging?.values() ?? [])].filter(c => c.before === null).map(c => c.path)
        return {
            notes: [...new Set([...(openPath ? [openPath] : []), ...messages.flatMap(m => m.metadata?.notes ?? []), ...created].map(slashed))],
            folders: [...new Set(messages.flatMap(m => m.metadata?.folders ?? []).map(slashed))],
        }
    }

    /**
     * The note a proposal changes: `path`'s, else the open one; it must be in the chat's scope. Errors are worded for
     * the model.
     */
    function editTargetFor(entry: LiveChat, path: string | undefined): {id: string, open: boolean} | {error: string} {
        const open = editTarget()
        const file = path ? findNote(path) : open && $index.getFileByUuid(open)
        if (!file) return {error: path ? `There's no note at "${path}". Use searchNotes or findFiles for its path.` : 'No note is open in the editor. Pass the `path` of the note to change.'}
        const at = slashed(file.relativePath)
        const named = namedNotes(entry.chat.messages)
        if (!inScope(at, entry.meta.scope, named)) {
            return {error: `"${at}" is outside this chat's scope, which allows ${scopeText(entry.meta.scope, named)}. Ask the user to widen the scope or attach the note.`}
        }
        return {id: file.uuid, open: file.uuid === open}
    }

    // Write mode: a reply's tools stage changes (`stage`); the user applies them after it (`applyChanges`).

    const vaultOf = async () => nuxtApp.runWithContext(() => useWorkspaceVault(session!))
    /** The note at exactly `path` (workspace-relative), if the index has it. */
    const noteAt = (path: string) => noteFiles().find(f => slashed(f.relativePath) === path)
    /** The note's text now (its mounted editor's buffer first); `null` when there's no note at `path`. */
    const textAt = async (path: string) => noteAt(path) ? readNote(path) : null

    /** Writes a note's text: into its mounted editor (so unsaved typing isn't lost and ⌘Z undoes it), else the file. */
    async function writeAt(path: string, text: string) {
        const file = noteAt(path)
        const view = file && editorViewOf(session, file.uuid)
        if (view) view.dispatch({changes: textChange(view.state.doc.toString(), text), userEvent: 'input.ai'})
        else await (await vaultOf()).write(path, text)
    }

    /** Creates a note, and the folders it needs, top down (the index places a node under an indexed parent only). */
    async function createAt(path: string, text: string) {
        const vault = await vaultOf()
        const folders = path.split('/').slice(0, -1)
        for (let i = 1; i <= folders.length; i++) {
            const dir = folders.slice(0, i).join('/')
            if (!vault.entry(dir)) await vault.createFolder(dir)
        }
        await vault.create(path, text)
    }

    /** The staged change a path (or a note's name) refers to in the reply being written. */
    function stagedKey(entry: LiveChat, path: string) {
        const staged = entry.staging
        if (!staged?.size) return undefined
        const file = findNote(path)
        return [path, `${path}.md`, file && slashed(file.relativePath)].find(key => key && staged.has(key)) || undefined
    }

    /** `readNote` in Write mode: what the reply has staged for the note, else the note. */
    async function readStaged(entry: LiveChat, path: string) {
        const key = stagedKey(entry, path)
        return key ? entry.staging!.get(key)!.after : readNote(path)
    }

    /** Stages `markdown` as a note's new text (`create`: a new note). Results and errors are worded for the model. */
    async function stage(entry: LiveChat, path: string, markdown: string, create: boolean): Promise<{ error: string } | { status: 'staged', path: string }> {
        const staged = entry.staging ??= new Map()
        const known = stagedKey(entry, path)
        let at: string
        let before: string | null
        if (known) {
            at = known
            before = staged.get(known)!.before
        } else if (create) {
            try {
                at = newNotePath(path)
            } catch (e) {
                return {error: e instanceof Error ? e.message : String(e)}
            }
            if (noteAt(at)) return {error: `"${at}" already exists. Use writeNote or editNote to change it.`}
            before = null
        } else {
            const file = findNote(path)
            if (!file) return {error: `There's no note at "${path}". Use searchNotes or findFiles for its path, or createNote for a new note.`}
            at = slashed(file.relativePath)
            before = await readNote(at)
            if (before === null) return {error: `"${at}" couldn't be read.`}
        }
        const named = namedNotes(entry.chat.messages, staged)
        // A new note is the chat's own (named); a folder scope still keeps it inside the folder.
        const allowed = before === null && entry.meta.scope?.kind !== 'folder' || inScope(at, entry.meta.scope, named)
        if (!allowed) return {error: `"${at}" is outside this chat's scope, which allows ${scopeText(entry.meta.scope, named)}. Ask the user to widen the scope or attach the note.`}
        staged.set(at, {path: at, before, after: markdown, state: 'pending'})
        return {status: 'staged', path: at}
    }

    /**
     * `bash`: `command` in the reply's sandbox over the workspace's text files (as `read` gives them). In Write mode the
     * files it wrote that differ from the notes are staged; new files only as `.md` notes. Worded for the model.
     */
    async function runBash(entry: LiveChat, command: string, read: (path: string) => Promise<string | null>, signal?: AbortSignal): Promise<object> {
        const paths = () => noteFiles().map(f => slashed(f.relativePath)).filter(p => !p.split('/').some(part => part.startsWith('.')))
        const box = await (entry.sandbox ??= createSandbox(paths(), read))
        const result = await runCommand(box, command, signal)
        if (modeOf(entry) !== 'write') return result
        const staged: string[] = []
        const notStaged: { path: string, error: string }[] = []
        for (const w of await sandboxWrites(box, read)) {
            const done = w.create && !/\.md$/i.test(w.path)
                ? {error: 'Only Markdown notes (.md) are staged; other new files stay in the sandbox.'}
                : await stage(entry, w.path, w.text, w.create)
            if ('error' in done) notStaged.push({path: w.path, error: done.error})
            else staged.push(done.path)
        }
        return {...result, ...(staged.length && {staged}), ...(notStaged.length && {notStaged})}
    }

    const updateMessage = (entry: LiveChat, messageId: string | undefined, change: (m: VertexChatMessage) => VertexChatMessage) => {
        entry.chat.messages = entry.chat.messages.map(m => m.id === messageId ? change(m) : m)
    }

    /** At the end of a reply (also a stopped or failed one): its staged changes go on it, for review. */
    function keepStaged(entry: LiveChat) {
        const changes = [...entry.staging?.values() ?? []]
        entry.staging = undefined
        const reply = entry.chat.messages.at(-1)
        if (!changes.length || reply?.role !== 'assistant') return
        updateMessage(entry, reply.id, m => ({...m, metadata: {...m.metadata, changes: [...m.metadata?.changes ?? [], ...changes]}}))
    }

    /** Sets the state of a reply's pending changes at `paths`, through `decide` (which may write the note), then saves. */
    async function settleChanges(id: string, messageId: string, paths: string[], decide: (c: ChatChange) => Promise<ChatChange['state']>) {
        const entry = live.get(keyOf(id))
        const changes = entry?.chat.messages.find(m => m.id === messageId)?.metadata?.changes
        if (!entry || !changes) return
        const next = [...changes]
        try {
            for (const [i, c] of next.entries()) if (c.state === 'pending' && paths.includes(c.path)) next[i] = {...c, state: await decide(c)}
        } finally {
            // What was decided before a failure stays decided.
            updateMessage(entry, messageId, m => ({...m, metadata: {...m.metadata, changes: next}}))
            await save(entry)
        }
    }

    /** Applies a reply's changes at `paths`; a note that changed since it was staged is left alone (`conflict`). */
    const applyChanges = (id: string, messageId: string, paths: string[]) => settleChanges(id, messageId, paths, async c => {
        if (await textAt(c.path) !== c.before) return 'conflict'
        if (c.before === null) await createAt(c.path, c.after)
        else await writeAt(c.path, c.after)
        return 'applied'
    })

    const discardChanges = (id: string, messageId: string, paths: string[]) => settleChanges(id, messageId, paths, async () => 'discarded')

    /** The applied changes in the replies after `messageId`, newest first: what rewinding to it undoes. */
    function appliedAfter(id: string, messageId: string) {
        const messages = live.get(keyOf(id))?.chat.messages ?? []
        const at = messages.findIndex(m => m.id === messageId)
        return at < 0 ? [] : messages.slice(at + 1).flatMap(m => m.metadata?.changes ?? []).filter(c => c.state === 'applied').reverse()
    }

    /**
     * Reverts applied changes, newest first, each only while its note is still as the change left it; a created note
     * goes to `.vertex/trash`. Returns the paths undone and the ones left alone.
     */
    async function undoChanges(chatId: string, changes: ChatChange[]) {
        const undone: string[] = [], skipped: string[] = []
        for (const c of changes) {
            if (await textAt(c.path) !== c.after) {
                skipped.push(c.path)
                continue
            }
            if (c.before === null) await (await vaultOf()).move(c.path, `${TRASH_DIR}/chat-${chatId}/${Date.now()}/${c.path}`)
            else await writeAt(c.path, c.before)
            undone.push(c.path)
        }
        return {undone, skipped}
    }

    /**
     * Rejects the chat suggestions still waiting in the session's editors, before an edit, retry or rewind replaces the
     * messages that asked for them. ponytail: every chat's in the session; track which chat proposed what if they collide.
     */
    function withdrawSuggestions() {
        for (const view of editorViewsOf(session)) {
            for (const p of view.state.field(aiField, false) ?? []) if (p.source === 'tool') discardProposal(view, p.id)
        }
    }

    async function setupFor(entry: LiveChat, messages: VertexChatMessage[]): Promise<ChatSendSetup> {
        // A tool round goes on with the model that began the reply; a new reply takes a retry's pick, else the chat's.
        const last = messages.at(-1)
        const pinned = last?.role === 'assistant' ? last.metadata?.profileId ?? entry.meta.profileId : entry.retryProfileId ?? entry.meta.profileId
        entry.retryProfileId = undefined
        // A new reply stages from scratch; a tool round goes on with what its reply staged.
        if (last?.role !== 'assistant') {
            entry.staging = undefined
            entry.sandbox = undefined
        }
        const {profile, provider} = resolveModel(pinned)
        // Every send starts here, right after the user message was added.
        void saveLogged(entry)
        const toolsOn = profile.tools !== false
        const mode = modeOf(entry)
        const list = (folder: string) => noteFiles().map(f => slashed(f.relativePath)).filter(p => !folder || p.startsWith(`${folder}/`)).sort()
        const read = mode === 'write' ? (path: string) => readStaged(entry, path) : readNote
        const tools = toolsOn ? chatTools({
            search: query => invoke('notes_search', {root: requireRoot(), query}),
            read,
            openNote: () => {
                const shown = editTarget()
                const file = shown && $index.getFileByUuid(shown)
                return file ? slashed(file.relativePath) : undefined
            },
            openInEditor: path => openInEditor(entry.meta.id, path),
            fetchUrl: fetchPage,
            allowedHost: host => !!entry.meta.allowedHosts?.includes(host),
            list,
            files: workspaceFiles,
            mode,
            stage: async (path, markdown, create) => {
                const done = await stage(entry, path, markdown, create)
                // A file the sandbox already read would otherwise give `bash` the text from before this change.
                if ('path' in done) await (await entry.sandbox)?.fs.writeFile(`${WORKSPACE}/${done.path}`, markdown)
                return done
            },
            runWorkflow,
            bash: (command, signal) => runBash(entry, command, read, signal),
        }, usedToolNames(messages)) : undefined
        const named = namedNotes(messages, entry.staging)
        const open = toolsOn ? editTarget() : undefined
        const openFile = open && $index.getFileByUuid(open)
        // ponytail: every referenced folder's note paths, cut at 200 each; summarize if folders get huge.
        const folders = named.folders.map(folder => {
            const paths = list(folder)
            return `- "${folder}/": ${paths.slice(0, 200).map(p => `"${p}"`).join(', ') || '(no notes)'}${paths.length > 200 ? `, and ${paths.length - 200} more` : ''}`
        })
        const prompt = [
            profile.systemPrompt,
            toolsPrompt(mode, scopeText(entry.meta.scope, named), toolsOn),
            openFile ? `The open note is "${slashed(openFile.relativePath)}": readNote without a path and readSelection read it${mode === 'suggest' ? ', and the proposals edit it unless given a path' : ''}.` : '',
            folders.length ? `The user referenced these folders; their notes are:\n${folders.join('\n')}` : '',
            changesSummary(messages),
        ].filter(Boolean).join('\n\n')
        return {provider, profileId: profile.id, modelId: profile.modelId, params: profile.params, prompt, notes: await notesFor(messages), tools}
    }

    const firstLineTitle = (text: string) => text.trim().slice(0, 60)
    const textOf = (m: VertexChatMessage) => m.parts.map(p => p.type === 'text' ? p.text : '').join('')

    /**
     * After the first reply: the chat's model names it, unless the title was changed from the first message's or chat
     * titles are off (`aiConfig.chatTitles`).
     */
    async function autoTitle(entry: LiveChat) {
        if (!effective.value?.aiConfig.chatTitles) return
        const [question, answer, ...later] = entry.chat.messages
        if (later.length || question?.role !== 'user' || answer?.role !== 'assistant' || !textOf(answer).trim()) return
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
            if (meta.mode) meta.mode = toChatMode(meta.mode)
            const state = {meta: reactive(meta), root: r, storage: s, saving: Promise.resolve()}
            const chat = new Chat<VertexChatMessage>({
                id,
                messages,
                transport: createChatTransport(m => setupFor(entry, m)),
                onFinish: ({isAbort, isError}) => {
                    keepStaged(entry)
                    void saveLogged(entry)
                    if (!isAbort && !isError) void autoTitle(entry)
                },
                // The editor tools have no `execute`: they run here. Reading the selection stays on the open note's
                // editor; a proposal first shows its note with the chat beside it, and answers once the user accepts or
                // rejects it. Then the reply goes on. `askUser` has none either: its card in ChatView answers it.
                onToolCall: ({toolCall}) => {
                    if (!isEditorTool(toolCall)) return
                    const answer = (output: unknown) => entry.chat.addToolOutput({tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output})
                    const refused = modeError(toolCall.toolName, modeOf(entry))
                    if (refused) return void answer(refused)
                    if (!toolCall.toolName.startsWith('propose')) {
                        const open = editTarget()
                        const view = open && editorViewOf(session, open)
                        return void (view ? runEditorTool(view, toolCall).then(answer) : answer({error: 'No note is open in the editor.'}))
                    }
                    const input = (toolCall.input ?? {}) as { path?: string, after?: string }
                    const target = editTargetFor(entry, input.path)
                    if ('error' in target) return void answer(target)
                    // Not awaited: onToolCall must return before the proposal is decided.
                    void editorFor(id, target.id)
                        .then(view => {
                            if (!view) return {error: 'The note could not be shown in the editor.'}
                            // Into a note that wasn't open: at its end, not wherever its cursor was left.
                            if (toolCall.toolName === 'proposeInsert' && input.after === undefined && !target.open) view.dispatch({selection: {anchor: view.state.doc.length}})
                            return runEditorTool(view, toolCall)
                        })
                        .then(answer)
                },
                // A tool round goes on once every call has its output, or once a run asking for approval got its answer.
                sendAutomaticallyWhen: options => lastAssistantMessageIsCompleteWithToolCalls(options) || lastAssistantMessageIsCompleteWithApprovalResponses(options),
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
        const file: ChatFile = {version: 1, id: crypto.randomUUID(), title: '', folder, created: now, updated: now, messages: [], mode: defaultMode()}
        await chatClient.write(requireRoot(), storage.value, file)
        const {id, title, created, updated} = file
        const next: ChatSummary = {id, title, folder, created, updated}
        index.value?.chats.push(next)
        return next
    }

    async function update(id: string, patch: Partial<Pick<ChatFile, 'title' | 'folder' | 'profileId' | 'mode' | 'scope'>>) {
        const entry = await load(id)
        Object.assign(entry.meta, patch)
        await save(entry)
    }

    /** `fetchUrl` fetches from `host` in this chat without asking from now on. */
    async function allowHost(id: string, host: string) {
        const entry = await load(id)
        if (entry.meta.allowedHosts?.includes(host)) return
        entry.meta.allowedHosts = [...entry.meta.allowedHosts ?? [], host]
        await save(entry)
    }

    /** The last reply's call still waiting on the user in the chat: an `askUser` question, or a run to approve. */
    function waitingCall(entry: LiveChat) {
        const last = entry.chat.messages.at(-1)
        if (last?.role !== 'assistant') return undefined
        return last.parts.filter(isToolUIPart).find(p => p.state === 'approval-requested' || p.state === 'input-available' && getToolName(p) === ASK_USER)
    }

    /**
     * Sends a message. While the last reply waits on a question or an approval, the text answers that instead (an
     * approval as declined, with the text as the reason), so the reply goes on and no new one starts.
     */
    async function send(id: string, text: string, notes: string[], folders: string[]) {
        const entry = await load(id)
        resolveModel(entry.meta.profileId)
        const waiting = waitingCall(entry)
        if (waiting?.state === 'approval-requested') return entry.chat.addToolApprovalResponse({id: waiting.approval.id, approved: false, reason: text})
        if (waiting) {
            const output: AskUserOutput = {reply: text, ...(notes.length && {notes}), ...(folders.length && {folders})}
            return entry.chat.addToolOutput({tool: ASK_USER, toolCallId: waiting.toolCallId, output})
        }
        if (!entry.meta.title) entry.meta.title = firstLineTitle(text)
        await entry.chat.sendMessage({text, metadata: {notes, folders, createdAt: Date.now(), mode: modeOf(entry)}})
    }

    /** A loaded chat that isn't replying, and where `messageId` is in it. */
    function idleAt(id: string, messageId: string) {
        const entry = live.get(keyOf(id))
        const at = entry?.chat.messages.findIndex(m => m.id === messageId) ?? -1
        if (!entry || at === -1 || entry.chat.status === 'submitted' || entry.chat.status === 'streaming') return undefined
        return {entry, at}
    }

    /** Sends `text` in place of a user message (same notes); the old one and what followed it stay as a branch. */
    async function editMessage(id: string, messageId: string, text: string) {
        const found = idleAt(id, messageId)
        if (!found) return
        const {entry, at} = found
        resolveModel(entry.meta.profileId)
        withdrawSuggestions()
        const {notes = [], folders = []} = entry.chat.messages[at]!.metadata ?? {}
        entry.meta.forks ??= {}
        entry.chat.messages = fork(entry.meta.forks, entry.chat.messages, at)
        await entry.chat.sendMessage({text, metadata: {notes, folders, createdAt: Date.now(), mode: modeOf(entry)}})
    }

    /** Writes a reply again, with `profileId` instead of the chat's model if given; the old one stays as a branch. */
    async function retryMessage(id: string, messageId: string, profileId?: string) {
        const found = idleAt(id, messageId)
        if (!found) return
        const {entry, at} = found
        resolveModel(profileId ?? entry.meta.profileId)
        withdrawSuggestions()
        entry.meta.forks ??= {}
        entry.chat.messages = fork(entry.meta.forks, entry.chat.messages, at)
        entry.retryProfileId = profileId
        await entry.chat.regenerate()
    }

    /**
     * Drops everything after `messageId`, with the branches that hung off it, and undoes the changes applied from the
     * dropped replies (see `undoChanges`).
     */
    async function rewindTo(id: string, messageId: string) {
        const found = idleAt(id, messageId)
        if (!found) return {undone: [], skipped: []}
        const {entry, at} = found
        withdrawSuggestions()
        const result = await undoChanges(id, appliedAfter(id, messageId))
        entry.chat.messages = entry.chat.messages.slice(0, at + 1)
        if (entry.meta.forks) entry.meta.forks = pruneForks(entry.meta.forks, entry.chat.messages)
        await save(entry)
        return result
    }

    /** Shows branch `to` (0-based) where `messageId` starts a fork. */
    async function showBranch(id: string, messageId: string, to: number) {
        const found = idleAt(id, messageId)
        if (!found?.entry.meta.forks) return
        const {entry, at} = found
        withdrawSuggestions()
        entry.chat.messages = switchBranch(entry.meta.forks!, entry.chat.messages, at, to)
        await save(entry)
    }

    /** Closes the chat's tab; if it was the shown one, shows the next (`closeTabElsewhere`). */
    const closeChatTab = (id: string) => $tabs.closeTabElsewhere(id)

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

    /** Shows the chat in the Chat view (closing its tab); with that view hidden, in a tab instead. */
    function showInSidePanel(id: string) {
        if (!panels.showView('chat')) return void openInTab(id)
        sidePanelChatId.value = id
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
        /** A loaded chat's mode (chats from before modes: the settings' default) and scope. */
        chatMode: (id: string) => computed(() => {
            const entry = live.get(keyOf(id))
            return entry ? modeOf(entry) : defaultMode()
        }),
        chatScope: (id: string) => computed(() => live.get(keyOf(id))?.meta.scope),
        /** The profile a loaded chat sends with (its pinned one while usable, else the chat feature's); none when there's no model. */
        chatProfile: (id: string) => {
            try {
                return resolveModel(live.get(keyOf(id))?.meta.profileId).profile
            } catch {
                return undefined
            }
        },
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
        editMessage,
        retryMessage,
        rewindTo,
        showBranch,
        applyChanges,
        discardChanges,
        openChange,
        appliedAfter,
        /** Which branch shows at `messageId`, of how many; undefined where nothing forks. */
        branchOf: (id: string, messageId: string) => {
            const entry = live.get(keyOf(id))
            const messages = entry?.chat.messages ?? []
            return branchAt(entry?.meta.forks, messages, messages.findIndex(m => m.id === messageId))
        },
        setProfile: (id: string, profileId: string | undefined) => update(id, {profileId}),
        setMode: (id: string, mode: ChatMode) => update(id, {mode}),
        setScope: (id: string, scope: ChatScope) => update(id, {scope}),
        sidePanelChatId,
        showInSidePanel,
        openInTab,
        askInChat,
        allowHost,
        pendingPrompt,
    }
}
