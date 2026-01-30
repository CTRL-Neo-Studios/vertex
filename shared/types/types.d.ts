import type {ShallowRef} from "vue";
import type {Frontmatter} from "#codemirror-rich-obsidian-editor/editor-types"

export type FrontmatterProperties = Frontmatter

export type PossiblyRef<T> = ComputedRef<T> | Ref<T> | ShallowRef<T> | T

export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
