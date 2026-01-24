import type {SpecialCodeBlockMapping} from "#codemirror-rich-obsidian-editor/editor-types";
import {EditorProseCodeBlockMermaidGraph} from "#components";

export function useActiveEditorCodeblockMappings() {
    return [
        {
            codeInfo: 'mermaid',
            component: EditorProseCodeBlockMermaidGraph
        }
    ] satisfies SpecialCodeBlockMapping[]
}