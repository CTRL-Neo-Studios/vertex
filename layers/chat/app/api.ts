/** The chat plugin's API (`ctx.use('chat')`). */
export interface ChatApi {
    /** Whether this window's workspace keeps its chats in the workspace (`.vertex/chats/`), so its repository holds them. Reactive. */
    chatsInWorkspace(): boolean
}

declare module '#shared/plugin/api' {
    interface PluginApis {
        chat: ChatApi
    }
}
