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
    }
}
