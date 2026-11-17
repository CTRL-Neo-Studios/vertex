import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import type {PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import type {AiApi, AiModel} from './api'
import {AI_SEED, aiConfigOf, featureOn, profileWithProvider, resolveFeature} from '../shared/config'
import type {AiConfig, AiModelProfile, AiProviderProfile} from '../shared/types'
import {createAiFetch} from './lib/aiFetch'
import {registerFeature} from './lib/features'

let ctx: PluginContext | undefined
/** The plugin's context, for its components and composables (they work only while it runs). */
export const aiContext = () => ctx!

/** A profile and its provider, ready to call. */
function modelOf({profile, provider}: { profile: AiModelProfile, provider: AiProviderProfile }): AiModel {
    const fetch = createAiFetch(provider.id, profile.params)
    return {
        profile,
        provider,
        fetch,
        // `includeUsage`: streamed replies only report tokens when asked (`stream_options.include_usage`).
        languageModel: ({params = true} = {}) => createOpenAICompatible({
            name: 'vertex', baseURL: provider.baseURL, includeUsage: true,
            fetch: params ? fetch : createAiFetch(provider.id),
        }).chatModel(profile.modelId),
    }
}

export default definePlugin({
    setup(context) {
        ctx = context
        const config = (): AiConfig => aiConfigOf(context.config.value)
        // Nothing stored yet: write the seed, so Rust (which checks every request against the stored providers) has it.
        if (!Object.keys(context.config.value).length) {
            void context.config.set({...AI_SEED}).catch(error => console.error('[ai] could not write the first config:', error))
        }

        context.settings.page({
            id: 'ai', label: 'plugins.ai.nav.ai',
            children: [
                {label: 'plugins.ai.nav.providers', icon: 'i-lucide-server', path: 'providers'},
                {label: 'plugins.ai.nav.models', icon: 'i-lucide-box', path: 'models'},
                {label: 'plugins.ai.nav.features', icon: 'i-lucide-toggle-right', path: 'features'},
            ],
            component: () => import('./components/Settings.vue'),
        })

        context.provide({
            config,
            featureOn: id => featureOn(config(), id),
            resolveFeature(id) {
                const resolved = resolveFeature(config(), id)
                return resolved && modelOf(resolved)
            },
            resolveProfile(id) {
                const ai = config()
                const resolved = ai.enabled ? profileWithProvider(ai, ai.modelProfiles.find(p => p.id === id)) : null
                return resolved && modelOf(resolved)
            },
            async updateProfile(id, patch) {
                await context.config.set({modelProfiles: config().modelProfiles.map(p => (p.id === id ? {...p, ...patch} : p))})
            },
            editProfile: id => context.settings.open(`ai/models/${id}`),
            registerFeature,
        } satisfies AiApi)
    },
})
