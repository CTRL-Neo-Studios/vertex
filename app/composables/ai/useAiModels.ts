import type {AiModelInfo, AiProviderProfile} from "#shared/types/app/ai";
import {enrichFromCatalog, enrichFromOllamaShow, normalizeModels} from "#shared/utils/ai/models";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {aiClient} from "~/utils/aiClient";
import {createAiFetch} from "~/utils/aiFetch";

async function json(response: Response) {
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 500)}`)
    return response.json()
}

/** A provider's models, with metadata from its `/models` list, Ollama and models.dev. Failures are toasts. */
export function useAiModels() {
    const {t} = useI18n()
    const $qt = useQuickToasts()

    /** Every model the provider lists, enriched from models.dev; `undefined` (toasted) when the list fails. */
    async function list(provider: AiProviderProfile): Promise<AiModelInfo[] | undefined> {
        try {
            const base = provider.baseURL.replace(/\/+$/, '')
            const models = normalizeModels(await json(await createAiFetch(provider.id)(`${base}/models`)))
            const catalog = await aiClient.modelCatalog().catch(error => {
                console.warn('[useAiModels] no models.dev catalog:', error)
                return null
            })
            return catalog ? enrichFromCatalog(models, catalog, provider.baseURL) : models
        } catch (error) {
            $qt.error(t('app.settings.ai.providers.listFailed', {name: provider.name}), String(error))
        }
    }

    /** On an Ollama server, fills in what `/api/show` knows about each model (vision, tools, thinking, context). */
    async function enrich(provider: AiProviderProfile, models: AiModelInfo[]): Promise<AiModelInfo[]> {
        const aiFetch = createAiFetch(provider.id)
        const origin = new URL(provider.baseURL).origin
        const ollama = await aiFetch(`${origin}/api/version`).then(r => r.ok, () => false)
        if (!ollama) return models
        return Promise.all(models.map(model => aiFetch(`${origin}/api/show`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({model: model.id}),
        }).then(json).then(show => enrichFromOllamaShow(model, show), error => {
            console.warn(`[useAiModels] /api/show ${model.id}:`, error)
            return model
        })))
    }

    return {list, enrich}
}
