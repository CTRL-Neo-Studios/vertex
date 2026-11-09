<script setup lang="ts">
import type {TableColumn} from "@nuxt/ui";
import type {AiModelInfo, AiProviderProfile} from "#shared/types/app/ai";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAiModels} from "~/composables/ai/useAiModels";

/** Picks which of a provider's listed models to enable; saves them with their metadata. */
const props = defineProps<{ provider: AiProviderProfile }>()
const open = defineModel<boolean>('open', {default: false})
const {t} = useI18n()
const {updateProvider} = useAiConfig()
const {list, enrich} = useAiModels()

const PAGE_SIZE = 20
const models = ref<AiModelInfo[]>([])
const loading = ref(false)
const saving = ref(false)
const query = ref('')
const page = ref(1)
const selected = ref(new Set<string>())

watch(open, async isOpen => {
    if (!isOpen) return
    query.value = ''
    page.value = 1
    selected.value = new Set(props.provider.models.map(m => m.id))
    loading.value = true
    const listed = await list(props.provider)
    // Enriched up front so the list itself shows the badges (a no-op off Ollama).
    models.value = listed ? await enrich(props.provider, listed) : []
    loading.value = false
})

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    return q ? models.value.filter(m => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q)) : models.value
})
watch(query, () => page.value = 1)
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

function toggle(id: string, on: boolean) {
    const next = new Set(selected.value)
    if (on) next.add(id)
    else next.delete(id)
    selected.value = next
}

const columns = computed<TableColumn<AiModelInfo>[]>(() => [
    {id: 'select'},
    {accessorKey: 'id', header: t('app.settings.ai.providers.model')},
    {id: 'capabilities', header: t('app.settings.ai.providers.capabilities')},
])

// Already-enabled models the server no longer lists are kept as they were.
async function save() {
    saving.value = true
    const listed = new Set(models.value.map(m => m.id))
    const kept = props.provider.models.filter(m => !listed.has(m.id) && selected.value.has(m.id))
    const picked = models.value.filter(m => selected.value.has(m.id))
    await updateProvider(props.provider.id, {models: [...kept, ...picked]})
    saving.value = false
    open.value = false
}
</script>

<template>
    <UModal
        v-model:open="open"
        :title="t('app.settings.ai.providers.addModelsTitle', {name: provider.name})"
        :description="t('app.settings.ai.providers.addModelsDescription')"
        :ui="{content: 'max-w-3xl'}"
    >
        <template #body>
            <div class="space-y-3">
                <UInput v-model="query" class="w-full" icon="i-lucide-search" :placeholder="t('app.settings.ai.providers.searchModels')" autofocus/>
                <UTable :data="shown" :columns="columns" :loading="loading" :empty="t('app.settings.ai.providers.noModels')" class="max-h-[50vh]" sticky>
                    <template #select-cell="{row}">
                        <UCheckbox
                            :model-value="selected.has(row.original.id)"
                            :aria-label="row.original.id"
                            @update:model-value="toggle(row.original.id, $event === true)"
                        />
                    </template>
                    <template #id-cell="{row}">
                        <div class="min-w-0 max-w-80">
                            <div class="text-sm truncate">{{ row.original.name ?? row.original.id }}</div>
                            <div v-if="row.original.name" class="text-xs text-muted font-mono truncate">{{ row.original.id }}</div>
                        </div>
                    </template>
                    <template #capabilities-cell="{row}">
                        <SettingsAiModelBadges :model="row.original"/>
                    </template>
                </UTable>
                <div v-if="filtered.length > PAGE_SIZE" class="flex justify-center">
                    <UPagination v-model:page="page" :total="filtered.length" :items-per-page="PAGE_SIZE"/>
                </div>
            </div>
        </template>
        <template #footer="{close}">
            <div class="flex items-center gap-2 w-full">
                <span class="text-sm text-muted flex-1">{{ t('app.settings.ai.providers.selectedCount', {count: selected.size}) }}</span>
                <UButton color="neutral" variant="ghost" :label="t('app.settings.ai.cancel')" @click="close"/>
                <UButton :loading="saving" :disabled="loading" :label="t('app.settings.ai.providers.saveModels')" @click="save"/>
            </div>
        </template>
    </UModal>
</template>
