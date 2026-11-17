<script setup lang="ts">
import {vertexInvoke} from '~/utils/vertexInvoke'

/**
 * Install from a Git repository: a link (the repository, a branch or release page, `owner/repo`), then what to take
 * from it: its newest release (updates with each), a branch (follows it), or a tag (stays). Closes with the source
 * string (`git+https://…#releases`), or with a `.zip` URL given as the link.
 */
const props = defineProps<{ link?: string }>()
const emit = defineEmits<{ close: [string | false] }>()
const {t} = useI18n()

interface Resolution {
    source: string
    origin: string
    repository: string | null
    defaultBranch: string | null
    branches: string[]
    tags: string[]
    release: string | null
}

const link = ref(props.link ?? '')
const looking = ref(false)
const error = ref('')
const found = shallowRef<Resolution>()
const pick = ref<'release' | 'branch' | 'tag'>('release')
const branch = ref('')
const tag = ref('')

async function lookUp() {
    if (!link.value.trim() || looking.value) return
    looking.value = true
    error.value = ''
    found.value = undefined
    try {
        const r = await vertexInvoke<Resolution>('plugin_source_resolve', {link: link.value.trim()})
        if (!r.repository) return emit('close', r.source)
        const [, what = 'releases'] = r.source.split('#')
        const [kind, name = ''] = what.split(/:(.*)/s)
        branch.value = kind === 'branch' ? name : r.defaultBranch ?? r.branches[0] ?? ''
        tag.value = kind === 'tag' ? name : r.tags.at(-1) ?? ''
        pick.value = kind === 'branch' ? 'branch' : kind === 'tag' ? 'tag' : r.release ? 'release' : 'branch'
        found.value = r
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
    } finally {
        looking.value = false
    }
}
if (props.link) void lookUp()

const choices = computed(() => [
    {value: 'release', label: found.value?.release ? t('app.settings.plugins.gitModal.release', {tag: found.value.release}) : t('app.settings.plugins.gitModal.noRelease'), description: t('app.settings.plugins.gitModal.releaseHint'), disabled: !found.value?.release},
    {value: 'branch', label: t('app.settings.plugins.gitModal.branch'), description: t('app.settings.plugins.gitModal.branchHint'), disabled: !found.value?.branches.length},
    {value: 'tag', label: t('app.settings.plugins.gitModal.tag'), description: t('app.settings.plugins.gitModal.tagHint'), disabled: !found.value?.tags.length},
])

function submit() {
    const r = found.value
    if (!r?.repository) return lookUp()
    const what = pick.value === 'release' ? 'releases' : pick.value === 'branch' ? `branch:${branch.value}` : `tag:${tag.value}`
    emit('close', `git+${r.repository}#${what}`)
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="t('app.settings.plugins.gitModal.title')"
        :description="t('app.settings.plugins.gitModal.description')"
    >
        <template #body>
            <div class="space-y-4" data-plugin-git>
                <div class="flex gap-2">
                    <UInput
                        v-model="link"
                        class="flex-1"
                        autofocus
                        :placeholder="t('app.settings.plugins.gitModal.placeholder')"
                        data-plugin-git-link
                        @keydown.enter="found ? submit() : lookUp()"
                        @update:model-value="found = undefined"
                    />
                    <UButton color="neutral" variant="outline" :loading="looking" :label="t('app.settings.plugins.gitModal.lookUp')" @click="lookUp"/>
                </div>
                <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-x" :description="error" data-plugin-git-error/>
                <template v-if="found">
                    <p class="text-sm text-muted">{{ found.origin }}</p>
                    <URadioGroup v-model="pick" :items="choices" data-plugin-git-pick/>
                    <USelect v-if="pick === 'branch'" v-model="branch" :items="found.branches" class="w-full"/>
                    <USelect v-if="pick === 'tag'" v-model="tag" :items="found.tags" class="w-full"/>
                </template>
            </div>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="t('app.settings.plugins.installModal.cancel')" @click="() => emit('close', false)"/>
                <UButton size="sm" :disabled="!found" :label="t('app.settings.plugins.urlModal.next')" data-plugin-git-next @click="submit"/>
            </div>
        </template>
    </UModal>
</template>
