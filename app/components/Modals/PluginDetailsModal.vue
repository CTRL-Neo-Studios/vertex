<script setup lang="ts">
import {openUrlInBrowser} from '~/composables/app/useAppOpener'
import {vertexInvoke} from '~/utils/vertexInvoke'

/** What the details dialog closes with: what its row should do next. */
export type PluginDetailsAction = 'update' | 'remove' | 'repository' | false

/**
 * A plugin's details, from its row on Settings → Plugins: its name and version, its description, why it's off, what
 * the row leaves out (author, needs, uses, where it came from), and its README. Update, Remove and Use its repository
 * close it with that action; Open where it came from opens the browser.
 */
const props = defineProps<{
    name: string
    icon: string
    /** A community or workspace plugin's; a core plugin's is Vertex's. */
    version?: string
    description?: string
    error?: string
    facts: string[]
    /** Whose `README.md` to read (`root`: a workspace's copy); none for a core plugin, which has none. */
    readmeOf?: { id: string, root: string | null }
    /** Where its README's relative images are. */
    assetUrl?: (path: string) => string
    url?: string
    /** The Update button's label, while there's one. */
    update?: string
    /** A repository it names that it wasn't fetched from. */
    claim?: string
    removable?: boolean
}>()
const emit = defineEmits<{ close: [PluginDetailsAction] }>()
const {t} = useI18n()

const readme = ref<string | null>(null)
onMounted(async () => {
    if (props.readmeOf) readme.value = await vertexInvoke<string | null>('plugin_readme', props.readmeOf).catch(() => null)
})
const actions = computed(() => !!(props.url || props.claim || props.update || props.removable))
</script>

<template>
    <UModal :close="{ onClick: () => emit('close', false) }" :description="description" :ui="{content: 'sm:max-w-2xl'}">
        <template #title>
            <span class="flex items-center gap-2">
                <UIcon :name="icon" class="size-5 shrink-0 text-muted"/>
                <span class="truncate">{{ name }}</span>
                <span v-if="version" class="text-sm font-normal text-dimmed" data-plugin-details-version>{{ version }}</span>
            </span>
        </template>
        <template v-if="error || facts.length || readme" #body>
            <div class="space-y-4 text-sm" data-plugin-details>
                <p v-if="error" class="text-error">{{ error }}</p>
                <ul v-if="facts.length" class="space-y-0.5 text-muted" data-plugin-details-facts>
                    <li v-for="fact in facts" :key="fact">{{ fact }}</li>
                </ul>
                <div v-if="readme" class="border-t border-default pt-4" data-plugin-readme>
                    <MarkdownText :value="readme" :asset-url/>
                </div>
            </div>
        </template>
        <template v-if="actions" #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton v-if="url" size="sm" color="neutral" variant="ghost" icon="i-lucide-external-link" :label="t('app.settings.plugins.openOrigin')" @click="openUrlInBrowser(url)"/>
                <UButton v-if="claim" size="sm" color="neutral" variant="outline" :label="t('app.settings.plugins.useRepository')" data-plugin-use-repository @click="emit('close', 'repository')"/>
                <UButton v-if="removable" size="sm" color="error" variant="soft" icon="i-lucide-trash-2" :label="t('app.settings.plugins.remove')" data-plugin-details-remove @click="emit('close', 'remove')"/>
                <UButton v-if="update" size="sm" icon="i-lucide-arrow-up-circle" :label="update" data-plugin-details-update @click="emit('close', 'update')"/>
            </div>
        </template>
    </UModal>
</template>
