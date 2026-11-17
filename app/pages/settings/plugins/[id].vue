<script setup lang="ts">
import {pickToOpen} from "~/utils/dialogs";
import type {ConfigField} from "#shared/plugin/manifest";
import {sanitizeField} from "#shared/plugin/config";
import {getAt} from "#shared/utils/settings/paths";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {useTrust} from "~/composables/app/useTrust";
import {pluginManifest} from "~/utils/plugins/catalog";
import {platform} from "@tauri-apps/plugin-os";

definePageMeta({
    layout: 'settings'
})

/**
 * A plugin's settings, drawn from its manifest's `config.schema` without running it. Each row follows the scope being
 * edited like any setting: in a workspace, the keys the manifest doesn't let it override are "Global only". The
 * plugin's strings get `{mod}`, the shortcut modifier (⌘ or Ctrl).
 */
const {t} = useI18n()
const mod = platform() === 'macos' ? '⌘' : 'Ctrl'
const tField = (key: string) => t(key, {mod})
const $qt = useQuickToasts()
const route = useRoute()
const {config, load} = useAppSettings()
const scope = useSettingsScope()
const trust = useTrust()
onMounted(load)

const id = computed(() => String(route.params.id))
const manifest = computed(() => pluginManifest(id.value))
const fields = computed(() => manifest.value?.config?.schema ?? [])
const at = (field: ConfigField) => `plugins.config.${id.value}.${field.key}` as AppSettingPath

/** What the row shows: the scope's value (a workspace's own even before it applies), checked and defaulted. */
const valueOf = <F extends ConfigField>(field: F) => sanitizeField(field, scope.value(at(field))) as F['default']
const set = (field: ConfigField, value: unknown) => scope.set({[at(field)]: value})
// The color picker reports every step of a drag.
const setSoon = useDebounceFn(set, 250)

/** In User: a field stored with something other than its default. In a workspace: any field it overrides. */
const dirty = computed(() => fields.value.some(f => (scope.root.value
    ? scope.overridden(at(f))
    : getAt(config.value, at(f)) !== undefined && JSON.stringify(getAt(config.value, at(f))) !== JSON.stringify(f.default))))
const reset = () => scope.set(Object.fromEntries(fields.value.map(f => [at(f), null])))
/** Overrides this workspace sets that apply only once it's trusted. */
const waitsForTrust = computed(() => !scope.trusted.value
    && fields.value.some(f => scope.overridden(at(f)) && scope.levelOf(at(f)) === 'trustedWorkspace'))

const inputValue = (event: Event) => (event.target as HTMLInputElement).value

/** Path fields hold paths inside the workspace; the picker is offered while a workspace's settings are edited. */
async function pick(field: Extract<ConfigField, {type: 'path'}>) {
    const root = scope.root.value
    if (!root) return
    const chosen = await pickToOpen({directory: field.kind === 'folder', defaultPath: root})
    if (!chosen) return
    if (chosen !== root && !chosen.startsWith(`${root}/`)) return $qt.error(t('app.settings.plugins.pickOutside'))
    await set(field, chosen.slice(root.length + 1))
}
</script>

<template>
    <SettingsScrollLayout :title="manifest?.name ?? id">
        <template #header-leading>
            <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-chevron-left"
                :aria-label="t('app.settings.plugins.title')"
                :to="{path: '/settings/plugins'}"
            />
        </template>
        <UEmpty v-if="!manifest" variant="naked" icon="i-lucide-puzzle" :title="t('app.settings.plugins.notFound', {id})"/>
        <div v-else class="space-y-4">
            <UAlert
                v-if="waitsForTrust"
                color="warning"
                variant="subtle"
                icon="i-lucide-shield-alert"
                :title="t('app.settings.plugins.settingsWaitForTrust')"
                :actions="[{label: t('app.settings.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                data-plugin-untrusted
            />
            <SettingsSection
                :title="t('app.settings.plugins.settings')"
                :description="manifest.description"
                :dirty="dirty"
                @reset="reset"
            >
                <p v-if="!fields.length" class="text-sm text-muted px-4 py-2.5">{{ t('app.settings.plugins.noSettings') }}</p>
                <SettingsRow
                    v-for="field in fields"
                    :key="field.key"
                    :setting="at(field)"
                    :label="tField(field.label)"
                    :description="field.description ? tField(field.description) : undefined"
                    :data-plugin-field="field.key"
                >
                    <USwitch v-if="field.type === 'switch'" :model-value="valueOf(field)" @update:model-value="set(field, $event)"/>
                    <UInput
                        v-else-if="field.type === 'text'"
                        class="w-56"
                        :model-value="valueOf(field)"
                        :placeholder="field.placeholder"
                        @change="set(field, inputValue($event))"
                    />
                    <UInputNumber
                        v-else-if="field.type === 'number'"
                        class="w-36"
                        :model-value="valueOf(field)"
                        :min="field.min"
                        :max="field.max"
                        :step="field.step"
                        @update:model-value="set(field, $event)"
                    />
                    <USelect
                        v-else-if="field.type === 'select'"
                        class="w-48"
                        :items="field.options.map(o => ({label: tField(o.label), value: o.value}))"
                        :model-value="valueOf(field)"
                        @update:model-value="set(field, $event)"
                    />
                    <UInputTags
                        v-else-if="field.type === 'list'"
                        class="w-64"
                        :model-value="valueOf(field)"
                        :placeholder="field.placeholder"
                        @update:model-value="set(field, $event)"
                    />
                    <UPopover v-else-if="field.type === 'color'">
                        <UButton color="neutral" variant="outline" size="sm" :label="valueOf(field) || field.placeholder">
                            <template #leading>
                                <span class="size-3.5 rounded-sm ring ring-default" :style="{background: valueOf(field)}"/>
                            </template>
                        </UButton>
                        <template #content>
                            <UColorPicker class="p-2" :model-value="valueOf(field)" @update:model-value="setSoon(field, $event)"/>
                        </template>
                    </UPopover>
                    <template v-else-if="field.type === 'path'">
                        <UInput class="w-56" :model-value="valueOf(field)" @change="set(field, inputValue($event))"/>
                        <UButton
                            v-if="scope.root.value"
                            size="sm"
                            color="neutral"
                            variant="outline"
                            :label="t('app.settings.plugins.pick')"
                            @click="pick(field)"
                        />
                    </template>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
