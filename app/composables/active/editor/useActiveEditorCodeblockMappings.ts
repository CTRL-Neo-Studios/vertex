import type {SpecialCodeBlockMapping} from "@type32/codemirror-rich-obsidian-editor";
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