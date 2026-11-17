import {getCurrentScope, onScopeDispose, shallowRef} from 'vue'
import type {AiFeatureDef} from '../api'

/** The features plugins registered (`registerFeature`), in order, for Settings → Assistive AI → Features. Reactive. */
export const features = shallowRef<readonly AiFeatureDef[]>([])

export function registerFeature(def: AiFeatureDef): () => void {
    if (def.id.includes('.')) throw new Error(`AI feature "${def.id}": an id can't contain dots`)
    if (features.value.some(f => f.id === def.id)) throw new Error(`AI feature "${def.id}" is already registered`)
    features.value = [...features.value, def]
    const remove = () => {
        features.value = features.value.filter(f => f !== def)
    }
    if (getCurrentScope()) onScopeDispose(remove)
    return remove
}
