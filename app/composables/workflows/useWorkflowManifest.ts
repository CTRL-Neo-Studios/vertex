import {localizeManifest} from "#shared/workflows/localize"
import {vertexLanguage} from "#shared/workflows/vertex"

/** The Vertex language's manifest in the app's language: node labels, descriptions, ports, categories, capabilities. */
export function useWorkflowManifest() {
    const {t, te} = useI18n()
    const key = (k: string) => `app.editor.ui.workflowLanguage.${k}`
    return computed(() => localizeManifest(vertexLanguage.manifest, (k, placeholders) => te(key(k)) ? t(key(k), placeholders) : undefined))
}
