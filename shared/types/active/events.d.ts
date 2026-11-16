import type {DispatcherEvent} from "@type32/dispatcher";

export interface EditorDispatcherEvents {
    editor: {
        /** Puts `text` on its own line at the open note's cursor, leaving the cursor after it ("Insert new base"). */
        insertBlock: DispatcherEvent<{ text: string }>
    }
}
