<script setup lang="ts">
import type {DropdownMenuItem} from "@nuxt/ui";
import type {AiModelProfile} from "#shared/types/app/ai";
import {Routes} from "#shared/constants/app";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const $route = useRoute()
const $router = useRouter()
const {load} = useAppSettings()
const {ai, addModelProfile, removeModelProfiles, setDefaultModelProfile} = useAiConfig()
onMounted(load)

const BASE = `${Routes.settings}/ai/models`
// The search lives in the URL, so a profile's Back link returns to it.
const query = computed({
    get: () => typeof $route.query.q === 'string' ? $route.query.q : '',
    set: q => void $router.replace({query: {...$route.query, q: q || undefined}}),
})
const linkTo = (id: string) => ({path: `${BASE}/${id}`, query: {q: query.value || undefined}})

const isDefault = (p: AiModelProfile) => p.id === ai.value?.defaultModelProfile
const providerName = (p: AiModelProfile) => ai.value?.providers.find(x => x.id === p.providerId)?.name ?? ''
const subtitle = (p: AiModelProfile) => [providerName(p), p.modelId || t('app.settings.ai.models.noModel')].filter(Boolean).join(' · ')
/** The default first, then by name. */
const profiles = computed(() => [...ai.value?.modelProfiles ?? []]
    .sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)) || a.name.localeCompare(b.name)))

async function add() {
    const profile = await addModelProfile({
        name: t('app.settings.ai.models.newProfile'),
        providerId: ai.value?.providers[0]?.id ?? '',
        modelId: '',
        systemPrompt: '',
    })
    await navigateTo(linkTo(profile.id))
}
async function duplicate(p: AiModelProfile) {
    const {id: _id, ...rest} = JSON.parse(JSON.stringify(p)) as AiModelProfile
    await addModelProfile({...rest, name: t('app.settings.ai.models.copyName', {name: p.name})})
}
const actions = (p: AiModelProfile): DropdownMenuItem[][] => [
    [
        {label: t('app.settings.ai.models.duplicate'), icon: 'i-lucide-copy', onSelect: () => void duplicate(p)},
        {label: t('app.settings.ai.models.setDefault'), icon: 'i-lucide-star', disabled: isDefault(p), onSelect: () => void setDefaultModelProfile(p.id)},
    ],
    [{label: t('app.settings.ai.models.remove'), icon: 'i-lucide-trash-2', color: 'error', disabled: isDefault(p), onSelect: () => void removeModelProfiles([p.id])}],
]
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.ai.models.title')" v-if="ai" global-only>
        <template #header-trailing>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('app.settings.ai.models.add')" @click="add"/>
        </template>
        <div class="space-y-4">
            <SettingsAiOffBanner/>
            <p class="text-sm text-muted">{{ t('app.settings.ai.models.description') }}</p>
            <SettingsAiList
                v-model:query="query"
                :items="profiles"
                :text="p => `${p.name} ${p.modelId} ${providerName(p)}`"
                :selectable="p => !isDefault(p)"
                :placeholder="t('app.settings.ai.models.search')"
                :empty="t('app.settings.ai.models.empty')"
                :confirm="count => t('app.settings.ai.models.removeConfirm', {count})"
                @remove="removeModelProfiles"
            >
                <template #row="{item}">
                    <NuxtLink :to="linkTo(item.id)" class="group block min-w-0">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-sm font-medium truncate group-hover:text-primary">{{ item.name || t('app.settings.ai.models.unnamed') }}</span>
                            <UBadge v-if="isDefault(item)" size="sm" variant="subtle" :label="t('app.settings.ai.models.isDefault')"/>
                            <UBadge v-if="item.tools === false" size="sm" color="neutral" variant="subtle" :label="t('app.settings.ai.models.toolsOff')"/>
                            <UBadge v-if="item.params" size="sm" color="neutral" variant="subtle" :label="t('app.settings.ai.models.customParams')"/>
                        </div>
                        <div class="text-xs text-muted truncate">{{ subtitle(item) }}</div>
                    </NuxtLink>
                </template>
                <template #actions="{item}">
                    <UDropdownMenu :items="actions(item)" size="sm" :content="{ align: 'end' }">
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="t('app.settings.ai.models.actions')"/>
                    </UDropdownMenu>
                    <UButton :to="linkTo(item.id)" size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('app.settings.ai.models.edit')"/>
                </template>
            </SettingsAiList>
        </div>
    </SettingsScrollLayout>
</template>
