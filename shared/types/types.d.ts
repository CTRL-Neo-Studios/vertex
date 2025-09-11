import type {ShallowRef} from "vue";

export type FrontmatterProperties = Record<string, string | string[] | number | Date>

export type PossiblyRef<T> = ComputedRef<T> | Ref<T> | ShallowRef<T> | T