import type {DispatcherEvent} from "@type32/dispatcher";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

export interface ToTocEntryProps {
    node: TocEntry,
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