import type {BaseViewDef} from "../api";

/** The layouts a base's views may use, by `type`: Bases' own and other plugins' (`registerView`). */
export const baseViews = shallowReactive(new Map<string, BaseViewDef>())

/** Adds a layout; a second one of the same type is an error. Removed with the scope it's called in, or by what it returns. */
export function registerView(def: BaseViewDef) {
    if (baseViews.has(def.type)) throw new Error(`a Bases view of type "${def.type}" is registered already`)
    baseViews.set(def.type, def)
    const remove = () => {
        if (baseViews.get(def.type) === def) baseViews.delete(def.type)
    }
    if (getCurrentScope()) onScopeDispose(remove)
    return remove
}
