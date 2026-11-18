<script setup lang="ts">
import type {AiProviderProfile} from "../../shared/types";
import {useAiConfig} from "../lib/useAiConfig";
import {aiClient} from "../lib/aiClient";
import {SettingsList, SettingsScrollLayout, SettingsSection} from "~/plugin/ui";

const {t} = useI18n()
const $route = useRoute()
const $router = useRouter()
const {ai, addProvider, removeProviders} = useAiConfig()

const BASE = '/settings/ai/providers'
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
    const provider = await addProvider({name: t('plugins.ai.providers.newProvider'), baseURL: 'https://', models: []})
    await navigateTo(linkTo(provider.id))
}
const text = (p: AiProviderProfile) => `${p.name} ${p.baseURL}`
</script>

<!-- settings-index: /settings/ai/providers -->
<template>
    <SettingsScrollLayout :title="t('plugins.ai.providers.title')" v-if="ai" global-only>
        <template #header-trailing>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('plugins.ai.providers.add')" @click="add"/>
        </template>
        <div class="space-y-4">
            <AiOffBanner/>
            <SettingsSection :title="t('plugins.ai.nav.providers')" :description="t('plugins.ai.providers.description')" :info="t('plugins.ai.providers.info')">
                <SettingsList
                    v-model:query="query"
                    :items="providers"
                    :text
                    :placeholder="t('plugins.ai.providers.search')"
                    :empty="t('plugins.ai.providers.empty')"
                    :actions="[{id: 'remove', label: count => t('plugins.ai.list.removeSelected', {count}), icon: 'i-lucide-trash-2', color: 'error',
                                confirm: count => t('plugins.ai.providers.removeConfirm', {count}), run: items => removeProviders(items.map(p => p.id))}]"
                >
                    <template #row="{item}">
                        <NuxtLink :to="linkTo(item.id)" class="group block min-w-0">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="text-sm font-medium truncate group-hover:text-primary">{{ item.name || t('plugins.ai.providers.unnamed') }}</span>
                                <UBadge v-if="keyed.has(item.id)" size="sm" color="success" variant="subtle" icon="i-lucide-key-round" :label="t('plugins.ai.providers.keySaved')"/>
                                <UBadge size="sm" color="neutral" variant="subtle" :label="t('plugins.ai.providers.modelCount', {count: item.models.length})"/>
                            </div>
                            <div class="text-xs text-muted font-mono truncate">{{ item.baseURL }}</div>
                        </NuxtLink>
                    </template>
                    <template #actions="{item}">
                        <UTooltip :text="t('plugins.ai.providers.remove')">
                            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('plugins.ai.providers.remove')" @click="removeProviders([item.id])"/>
                        </UTooltip>
                        <UButton :to="linkTo(item.id)" size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('plugins.ai.providers.edit')"/>
                    </template>
                </SettingsList>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
