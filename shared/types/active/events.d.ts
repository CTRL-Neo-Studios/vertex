import type {DispatcherEvent} from "@type32/dispatcher";

export interface ToTocEntryProps {
    /** Document position of the heading to jump to. */
    from: number,
    verticalScrollStrategy?: "nearest" | "start" | "end" | "center",
    verticalMargin?: number,
}

export interface EditorDispatcherEvents {
    editor: {
        tableOfContents: {
            toEntry: DispatcherEvent<ToTocEntryProps>
        }
        /** Puts `text` on its own line at the open note's cursor, leaving the cursor after it ("Insert new base"). */
        insertBlock: DispatcherEvent<{ text: string }>
    }
}
