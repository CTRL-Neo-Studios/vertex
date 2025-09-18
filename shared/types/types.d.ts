import type {ShallowRef} from "vue";
import type {Frontmatter} from "#codemirror-rich-obsidian-editor/editor-types"

export type FrontmatterProperties = Frontmatter

export type PossiblyRef<T> = ComputedRef<T> | Ref<T> | ShallowRef<T> | T