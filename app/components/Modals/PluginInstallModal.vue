<script setup lang="ts">
import type {PluginManifest} from '#shared/plugin/manifest'
import type {InstallRecord} from '~/utils/plugins/catalog'
import {describeOrigin} from '~/utils/plugins/origin'

/**
 * What installing a community plugin, or updating one, is agreeing to: its name, author and version, where it's from
 * (and where it says it's from, when that differs), the permissions it asks for, and that it runs as Vertex does. An
 * update shows what changed. A plugin from elsewhere than the installed one with its id (which would get that one's
 * settings, data and secrets) needs its own confirmation. With `workspace` (Settings edits a trusted workspace) it can
 * go into that workspace instead of every one. With `errors` (its manifest didn't validate) it can only be cancelled.
 * Its README, when it has one, is under all that, as in its details.
 * Closes with where to install it, or `false`.
 */
export type InstallTarget = 'global' | 'workspace'

/** The plugin with its id that installing replaces there, and where that one came from. */
export interface InstallPlace {
    current?: Partial<PluginManifest>
    installed?: InstallRecord | null
}

const props = defineProps<{
    manifest: Partial<PluginManifest>
    errors: string[]
    /** Where it's from, as staged. */
    resolved: InstallRecord
    /** The origin of the repository its manifest names. */
    claimed: string | null
    readme: string | null
    /** For every workspace: what it replaces. */
    global: InstallPlace
    /** The trusted workspace being edited (its name), and what it replaces there. */
    workspace?: InstallPlace & { name: string }
    target: InstallTarget
}>()
const emit = defineEmits<{ close: [InstallTarget | false] }>()
const {t} = useI18n()
const name = computed(() => (typeof props.manifest.name === 'string' && props.manifest.name) || props.manifest.id || '?')

const target = ref<InstallTarget>(props.target)
const place = computed<InstallPlace>(() => (target.value === 'workspace' && props.workspace) || props.global)
const targets = computed(() => [
    {value: 'global', label: t('app.settings.plugins.installModal.forEvery')},
    {value: 'workspace', label: t('app.settings.plugins.installModal.forWorkspace', {name: props.workspace?.name})},
])

const otherOrigin = computed(() => !!place.value.current && place.value.installed?.origin !== props.resolved.origin)
const confirmedOther = ref(false)
const claimDiffers = computed(() => !!props.claimed && props.claimed !== props.resolved.origin)

const permission = (p: string) => t(`app.settings.plugins.permission.${p}`)
/** What an update changes beside its code: permissions, requirements, `apiVersion`. */
const changes = computed(() => {
    const before = place.value.current
    if (!before) return []
    const added = (props.manifest.permissions ?? []).filter(p => !(before.permissions ?? []).includes(p))
    const removed = (before.permissions ?? []).filter(p => !(props.manifest.permissions ?? []).includes(p))
    const requires = (props.manifest.requires ?? []).join(', ') !== (before.requires ?? []).join(', ')
    return [
        ...added.map(p => ({warn: true, text: t('app.settings.plugins.installModal.permissionAdded', {permission: permission(p)})})),
        ...removed.map(p => ({warn: false, text: t('app.settings.plugins.installModal.permissionRemoved', {permission: permission(p)})})),
        ...(requires ? [{warn: false, text: t('app.settings.plugins.installModal.requiresChanged', {list: (props.manifest.requires ?? []).join(', ') || '—'})}] : []),
        ...(before.apiVersion !== props.manifest.apiVersion ? [{warn: false, text: t('app.settings.plugins.installModal.apiChanged', {from: before.apiVersion, to: props.manifest.apiVersion})}] : []),
    ]
})
const versionLine = computed(() => {
    const from = place.value.current?.version
    const to = props.manifest.version
    if (!from || !to || from === to) return undefined
    const later = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true}) > 0
    return t(later(from, to) ? 'app.settings.plugins.installModal.downgrade' : 'app.settings.plugins.installModal.upgrade', {from, to})
})
const updating = computed(() => !!place.value.current && !otherOrigin.value)
const title = computed(() => {
    if (props.errors.length) return t('app.settings.plugins.installModal.invalid')
    return t(updating.value ? 'app.settings.plugins.installModal.updateTitle' : 'app.settings.plugins.installModal.title', {name: name.value})
})
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :ui="readme ? {content: 'sm:max-w-2xl'} : undefined"
        :title="title"
        :description="[manifest.version && t('app.settings.plugins.version', {version: manifest.version}), manifest.author && t('app.settings.plugins.installModal.by', {author: manifest.author})].filter(Boolean).join(' · ')"
    >
        <template #body>
            <div class="space-y-3 text-sm" data-plugin-install>
                <UAlert
                    v-if="errors.length"
                    color="error"
                    variant="subtle"
                    icon="i-lucide-file-x"
                    :title="t('app.settings.plugins.installModal.errors')"
                    data-plugin-install-errors
                >
                    <template #description>
                        <ul class="list-disc ps-4">
                            <li v-for="error in errors" :key="error">{{ error }}</li>
                        </ul>
                    </template>
                </UAlert>
                <template v-else>
                    <p v-if="manifest.description" class="text-muted">{{ manifest.description }}</p>
                    <URadioGroup v-if="workspace" v-model="target" :items="targets" orientation="horizontal" size="sm" data-plugin-install-target/>
                    <p data-plugin-install-origin>{{ t('app.settings.plugins.installModal.from', {origin: describeOrigin(resolved, t)}) }}</p>
                    <p v-if="claimDiffers" class="text-warning" data-plugin-install-claim>{{ t('app.settings.plugins.installModal.claims', {origin: claimed}) }}</p>
                    <p v-if="versionLine" data-plugin-install-version>{{ versionLine }}</p>
                    <ul v-if="changes.length" class="list-disc ps-5" data-plugin-install-changes>
                        <li v-for="c in changes" :key="c.text" :class="c.warn ? 'text-warning' : 'text-muted'">{{ c.text }}</li>
                    </ul>
                    <div>
                        <p class="font-medium">{{ t('app.settings.plugins.installModal.permissions') }}</p>
                        <ul v-if="manifest.permissions?.length" class="list-disc ps-5 text-muted">
                            <li v-for="p in manifest.permissions" :key="p">{{ permission(p) }}</li>
                        </ul>
                        <p v-else class="text-muted">{{ t('app.settings.plugins.installModal.noPermissions') }}</p>
                        <p v-if="manifest.ownWindows?.length" class="text-muted" data-plugin-install-windows>{{ t('app.settings.plugins.installModal.ownWindows') }}</p>
                    </div>
                    <UAlert v-if="otherOrigin" color="error" variant="subtle" icon="i-lucide-shield-alert" data-plugin-install-other>
                        <template #description>
                            <p>{{ t('app.settings.plugins.installModal.otherOrigin', {id: manifest.id, installed: place.installed ? describeOrigin(place.installed, t) : t(target === 'workspace' ? 'app.settings.plugins.origin.copied' : 'app.settings.plugins.origin.unknown')}) }}</p>
                            <UCheckbox v-model="confirmedOther" class="mt-2" :label="t('app.settings.plugins.installModal.otherOriginConfirm')" data-plugin-install-other-confirm/>
                        </template>
                    </UAlert>
                    <UAlert color="warning" variant="subtle" icon="i-lucide-shield-alert" :description="t('app.settings.plugins.installModal.warning')"/>
                    <div v-if="readme" class="border-t border-default pt-4" data-plugin-readme>
                        <MarkdownText :value="readme"/>
                    </div>
                </template>
            </div>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="t('app.settings.plugins.installModal.cancel')" @click="() => emit('close', false)"/>
                <UButton
                    v-if="!errors.length"
                    size="sm"
                    :disabled="otherOrigin && !confirmedOther"
                    :label="updating ? t('app.settings.plugins.update') : t('app.settings.plugins.installModal.install')"
                    data-plugin-install-confirm
                    @click="() => emit('close', target)"
                />
            </div>
        </template>
    </UModal>
</template>
