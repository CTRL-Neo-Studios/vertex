<script setup lang="ts">
import type {DropdownMenuItem} from "@nuxt/ui";
import type {AiModelProfile} from "../../shared/types";
import {useAiConfig} from "../lib/useAiConfig";
import {SettingsList, SettingsScrollLayout, SettingsSection} from "~/plugin/ui";

const {t} = useI18n()
const $route = useRoute()
const $router = useRouter()
const {ai, addModelProfile, removeModelProfiles, setDefaultModelProfile} = useAiConfig()

const BASE = '/settings/ai/models'
// The search lives in the URL, so a profile's Back link returns to it.
const query = computed({
    get: () => typeof $route.query.q === 'string' ? $route.query.q : '',
    set: q => void $router.replace({query: {...$route.query, q: q || undefined}}),
})
const linkTo = (id: string) => ({path: `${BASE}/${id}`, query: {q: query.value || undefined}})

const isDefault = (p: AiModelProfile) => p.id === ai.value?.defaultModelProfile
const providerName = (p: AiModelProfile) => ai.value?.providers.find(x => x.id === p.providerId)?.name ?? ''
const subtitle = (p: AiModelProfile) => [providerName(p), p.modelId || t('plugins.ai.models.noModel')].filter(Boolean).join(' · ')
/** The default first, then by name. */
const profiles = computed(() => [...ai.value?.modelProfiles ?? []]
    .sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)) || a.name.localeCompare(b.name)))

async function add() {
    const profile = await addModelProfile({
        name: t('plugins.ai.models.newProfile'),
        providerId: ai.value?.providers[0]?.id ?? '',
        modelId: '',
        systemPrompt: '',
    })
    await navigateTo(linkTo(profile.id))
}
async function duplicate(p: AiModelProfile) {
    const {id: _id, ...rest} = JSON.parse(JSON.stringify(p)) as AiModelProfile
    await addModelProfile({...rest, name: t('plugins.ai.models.copyName', {name: p.name})})
}
const actions = (p: AiModelProfile): DropdownMenuItem[][] => [
    [
        {label: t('plugins.ai.models.duplicate'), icon: 'i-lucide-copy', onSelect: () => void duplicate(p)},
        {label: t('plugins.ai.models.setDefault'), icon: 'i-lucide-star', disabled: isDefault(p), onSelect: () => void setDefaultModelProfile(p.id)},
    ],
    [{label: t('plugins.ai.models.remove'), icon: 'i-lucide-trash-2', color: 'error', disabled: isDefault(p), onSelect: () => void removeModelProfiles([p.id])}],
]
</script>

<!-- settings-index: /settings/ai/models -->
<template>
    <SettingsScrollLayout :title="t('plugins.ai.models.title')" v-if="ai" global-only>
        <template #header-trailing>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('plugins.ai.models.add')" @click="add"/>
        </template>
        <div class="space-y-4">
            <AiOffBanner/>
            <SettingsSection :title="t('plugins.ai.nav.models')" :description="t('plugins.ai.models.description')">
                <SettingsList
                    v-model:query="query"
                    :items="profiles"
                    :text="p => `${p.name} ${p.modelId} ${providerName(p)}`"
                    :selectable="p => !isDefault(p)"
                    :placeholder="t('plugins.ai.models.search')"
                    :empty="t('plugins.ai.models.empty')"
                    :actions="[{id: 'remove', label: count => t('plugins.ai.list.removeSelected', {count}), icon: 'i-lucide-trash-2', color: 'error',
                                confirm: count => t('plugins.ai.models.removeConfirm', {count}), run: items => removeModelProfiles(items.map(p => p.id))}]"
                >
                    <template #row="{item}">
                        <NuxtLink :to="linkTo(item.id)" class="group block min-w-0">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="text-sm font-medium truncate group-hover:text-primary">{{ item.name || t('plugins.ai.models.unnamed') }}</span>
                                <UBadge v-if="isDefault(item)" size="sm" variant="subtle" :label="t('plugins.ai.models.isDefault')"/>
                                <UBadge v-if="item.tools === false" size="sm" color="neutral" variant="subtle" :label="t('plugins.ai.models.toolsOff')"/>
                                <UBadge v-if="item.params" size="sm" color="neutral" variant="subtle" :label="t('plugins.ai.models.customParams')"/>
                            </div>
                            <div class="text-xs text-muted truncate">{{ subtitle(item) }}</div>
                        </NuxtLink>
                    </template>
                    <template #actions="{item}">
                        <UDropdownMenu :items="actions(item)" size="sm" :content="{ align: 'end' }">
                            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="t('plugins.ai.models.actions')"/>
                        </UDropdownMenu>
                        <UButton :to="linkTo(item.id)" size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('plugins.ai.models.edit')"/>
                    </template>
                </SettingsList>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
