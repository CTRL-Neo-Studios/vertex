import type {SpecialCodeBlockMapping} from "#codemirror-rich-obsidian-editor/editor-types";
import {EditorProseCodeBlockMermaidGraph, ViewerEditorBasesEmbed} from "#components";

export function useActiveEditorCodeblockMappings() {
    return [
        {
            codeInfo: 'mermaid',
            component: EditorProseCodeBlockMermaidGraph
        },
        {
            codeInfo: 'base',
            component: ViewerEditorBasesEmbed
        }
    ] satisfies SpecialCodeBlockMapping[]
}