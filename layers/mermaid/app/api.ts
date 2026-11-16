import type {Component} from 'vue'

/** What mermaid offers other plugins (chat draws ```mermaid in replies with it). */
export interface MermaidApi {
    /** A diagram drawn from `source` (Mermaid syntax, through pele), with pele's `options`; loaded on first use. */
    Diagram: Component
}

declare module '#shared/plugin/api' {
    interface PluginApis {
        mermaid: MermaidApi
    }
}
