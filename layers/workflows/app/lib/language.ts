import {shallowRef} from 'vue'
import type {Language} from '@type32/workflows/core'
import {buildLanguage, type VertexEffects, type VertexExtension} from '../../shared/vertex'

/** What plugins added (`registerNodes`), in order; the language is rebuilt when it changes. */
const extensions = shallowRef<readonly VertexExtension[]>([])
let built: { from: readonly VertexExtension[], language: Language<VertexEffects> } | undefined

/** Vertex's language with every registered extension that builds. Reactive: a registration makes a new one. */
export function language(): Language<VertexEffects> {
    const from = extensions.value
    if (built?.from !== from) {
        const {language, failed} = buildLanguage(from)
        for (const {error} of failed) console.error('[workflows] a plugin\'s nodes were left out:', error)
        built = {from, language}
    }
    return built.language
}

/** Adds `extension` to the language; returns its removal. */
export function registerNodes(extension: VertexExtension): () => void {
    extensions.value = [...extensions.value, extension]
    return () => {
        extensions.value = extensions.value.filter(e => e !== extension)
    }
}
