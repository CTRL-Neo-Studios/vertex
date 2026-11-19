import type {PluginContext, SessionContext, UiSlot} from '#shared/plugin/api'

/** What a plugin's chat tool runs with: the chat's session, and a signal that aborts when the reply is stopped. */
export interface ChatToolContext {
    session: SessionContext
    signal?: AbortSignal
}

/** What a tool's `preview` draws with: the call's input (as the model passed it) and the chat's session. */
export interface ChatToolPreviewProps {
    input: unknown
    session: SessionContext
}

/** A plugin's tool for the chat's model (`ChatApi.registerTool`). */
export interface ChatToolDef {
    /** Letters, digits and `_`; the model sees it as `<plugin id>_<name>`. */
    name: string
    /** i18n key: what its card in the chat says it does, after the plugin's name. */
    label: string
    /** For the model: what it does, when to use it, what it returns. Chat's tool search matches its words. */
    description: string
    /** A JSON Schema object for its input. */
    inputSchema: Record<string, unknown>
    /**
     * It changes the workspace: it runs in Suggest and Write mode, each call approved by the user first; refused in
     * Read. Without it, it runs in every mode.
     */
    writes?: boolean
    /**
     * What the call will change, drawn under its row while the user is asked to approve it (so a `writes` tool's),
     * live: it reads the workspace as it is. Without it the row lists the input. Draw it with what `execute` will
     * run, so what's approved is what's done.
     */
    preview?: UiSlot<ChatToolPreviewProps>
    /**
     * What the model gets back, as JSON (cut at 20,000 characters); a throw gets it `{error: message}`. `input` is
     * what the model passed, not checked against `inputSchema`: the plugin types (and checks) it.
     */
    execute(input: unknown, context: ChatToolContext): unknown
}

/** The chat plugin's API (`ctx.use('chat')`). */
export interface ChatApi {
    /** Whether this window's workspace keeps its chats in the workspace (`.vertex/chats/`), so its repository holds them. Reactive. */
    chatsInWorkspace(): boolean
    /**
     * Adds a tool for chats' models on behalf of `plugin` (`ctx.plugin`), found through the chat's tool search. Removed
     * with the scope it's called in (a plugin's `setup`) or by what it returns.
     */
    registerTool(plugin: Pick<PluginContext['plugin'], 'id' | 'name'>, def: ChatToolDef): () => void
}

declare module '#shared/plugin/api' {
    interface PluginApis {
        chat: ChatApi
    }
}
