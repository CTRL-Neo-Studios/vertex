import {localizeManifest} from "../../shared/localize"
import {language} from "./language"

/** The Vertex language's manifest in the app's language: node labels, descriptions, ports, categories, capabilities. */
export function useWorkflowManifest() {
    const {t, te} = useNuxtApp().$i18n
    const key = (k: string) => `plugins.workflows.language.${k}`
    return computed(() => localizeManifest(language().manifest, (k, placeholders) => te(key(k)) ? t(key(k), placeholders) : undefined))
}
