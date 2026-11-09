<script setup lang="ts">
import type {AiProviderProfile} from "#shared/types/app/ai";
import {Routes} from "#shared/constants/app";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {aiClient} from "~/utils/aiClient";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const $route = useRoute()
const $router = useRouter()
const {load} = useAppSettings()
const {ai, addProvider, removeProviders} = useAiConfig()
onMounted(load)

const BASE = `${Routes.settings}/ai/providers`
// The search lives in the URL, so a provider's Back link returns to it.
const query = computed({
    get: () => typeof $route.query.q === 'string' ? $route.query.q : '',
    set: q => void $router.replace({query: {...$route.query, q: q || undefined}}),
})
const linkTo = (id: string) => ({path: `${BASE}/${id}`, query: {q: query.value || undefined}})
const providers = computed(() => [...ai.value?.providers ?? []].sort((a, b) => a.name.localeCompare(b.name)))

// Which providers have a key in the keychain (it's write-only: only whether there is one).
const keyed = ref(new Set<string>())
watch(() => ai.value?.providers.map(p => `${p.id} ${p.baseURL}`).join(), async () => {
    const ids = ai.value?.providers.map(p => p.id) ?? []
    const has = await Promise.all(ids.map(id => aiClient.hasKey(id).catch(() => false)))
    keyed.value = new Set(ids.filter((_, i) => has[i]))
}, {immediate: true})

async function add() {
    const provider = await addProvider({name: t('app.settings.ai.providers.newProvider'), baseURL: 'https://', models: []})
    await navigateTo(linkTo(provider.id))
}
const text = (p: AiProviderProfile) => `${p.name} ${p.baseURL}`
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.ai.providers.title')" v-if="ai" global-only>
        <template #header-trailing>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('app.settings.ai.providers.add')" @click="add"/>
        </template>
        <div class="space-y-4">
            <SettingsAiOffBanner/>
            <p class="text-sm text-muted">{{ t('app.settings.ai.providers.description') }}</p>
            <SettingsAiList
                v-model:query="query"
                :items="providers"
                :text
                :placeholder="t('app.settings.ai.providers.search')"
                :empty="t('app.settings.ai.providers.empty')"
                :confirm="count => t('app.settings.ai.providers.removeConfirm', {count})"
                @remove="removeProviders"
            >
                <template #row="{item}">
                    <NuxtLink :to="linkTo(item.id)" class="group block min-w-0">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-sm font-medium truncate group-hover:text-primary">{{ item.name || t('app.settings.ai.providers.unnamed') }}</span>
                            <UBadge v-if="keyed.has(item.id)" size="sm" color="success" variant="subtle" icon="i-lucide-key-round" :label="t('app.settings.ai.providers.keySaved')"/>
                            <UBadge size="sm" color="neutral" variant="subtle" :label="t('app.settings.ai.providers.modelCount', {count: item.models.length})"/>
                        </div>
                        <div class="text-xs text-muted font-mono truncate">{{ item.baseURL }}</div>
                    </NuxtLink>
                </template>
                <template #actions="{item}">
                    <UTooltip :text="t('app.settings.ai.providers.remove')">
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('app.settings.ai.providers.remove')" @click="removeProviders([item.id])"/>
                    </UTooltip>
                    <UButton :to="linkTo(item.id)" size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('app.settings.ai.providers.edit')"/>
                </template>
            </SettingsAiList>
        </div>
    </SettingsScrollLayout>
</template>
