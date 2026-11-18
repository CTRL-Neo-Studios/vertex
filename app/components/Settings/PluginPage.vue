<script setup lang="ts">
import {platform} from "@tauri-apps/plugin-os";
import type {ScopedConfig, SettingsPageDef, SettingsPageProps} from "#shared/plugin/api";
import type {ConfigField} from "#shared/plugin/manifest";
import {sanitizeField} from "#shared/plugin/config";
import {getAt} from "#shared/utils/settings/paths";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useTrust} from "~/composables/app/useTrust";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {pickToOpen} from "~/utils/dialogs";
import {pluginManifest} from "~/utils/plugins/catalog";
import {PLUGIN_ICON} from "~/utils/settingsNav";

/**
 * A plugin's one settings page (`/settings/plugins/<id>`, or `/settings/<page id>/…` for a plugin that registered a
 * page): its icon and name in the header, the fields of its manifest's `config.schema` (at the page's root), then the
 * page it registered with `path` (the route below its id) and its config in the scope being edited. The registered
 * page's `SettingsScrollLayout` draws inside this one: its title and header buttons go in this header. Schema fields
 * follow the scope like any setting; the plugin's strings get `{mod}`, the shortcut modifier (⌘ or Ctrl).
 */
const props = defineProps<{
    plugin: string
    page?: SettingsPageDef
    path: string[]
}>()
const {t} = useI18n()
const mod = platform() === 'macos' ? '⌘' : 'Ctrl'
const tField = (key: string) => t(key, {mod})
const $qt = useQuickToasts()
const {config, load} = useAppSettings()
const scope = useSettingsScope()
const trust = useTrust()
onMounted(load)

const manifest = computed(() => pluginManifest(props.plugin))
/** Its switch in the scope being edited, as on Settings → Plugins: a plugin that's off still has its settings here. */
const on = computed(() => (scope.value(`plugins.enabled.${props.plugin}` as AppSettingPath) as boolean | undefined) ?? manifest.value?.enabledByDefault ?? true)
/** At the page's root only: a page with sub-entries (AI) draws an item's page below it. */
const fields = computed(() => (props.path.length ? [] : manifest.value?.config?.schema ?? []))
const at = (field: ConfigField) => `plugins.config.${props.plugin}.${field.key}` as AppSettingPath

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

/** The plugin's config through the Settings window's scope: paths inside it become `plugins.config.<plugin>.<path>`. */
function scopedConfig(plugin: string): ScopedConfig {
    const path = (key: string) => `plugins.config.${plugin}.${key}` as const
    const setting = (key: string) => path(key) as AppSettingPath
    return {
        get root() { return scope.root.value },
        get trusted() { return scope.trusted.value },
        get effective() { return (getAt(scope.effective.value, `plugins.config.${plugin}`) ?? {}) as Record<string, unknown> },
        value: key => scope.value(setting(key)),
        set: patch => scope.set(Object.fromEntries(Object.entries(patch).map(([key, v]) => [path(key), v]))),
        overridden: key => scope.overridden(setting(key)),
        isDirty: (keys, defaults) => (scope.root.value
            ? keys.some(key => scope.overridden(setting(key)))
            : keys.some(key => JSON.stringify(scope.value(setting(key))) !== JSON.stringify(getAt(defaults, key)))),
        reset: (keys, defaults) => scope.set(Object.fromEntries(keys.map(key => [path(key), scope.root.value ? null : getAt(defaults, key)]))),
        path,
    }
}
const pageProps = computed<SettingsPageProps>(() => ({path: props.path, config: scopedConfig(props.plugin)}))
</script>

<template>
    <SettingsScrollLayout :title="page ? t(page.label) : manifest?.name ?? plugin">
        <template #header-leading>
            <UIcon :name="page?.icon ?? manifest?.icon ?? PLUGIN_ICON" class="size-5 me-1 text-muted"/>
        </template>
        <template #header-trailing>
            <UBadge v-if="manifest && !on" color="neutral" variant="subtle" :label="t('app.settings.plugins.filter.off')" data-plugin-off/>
        </template>
        <UEmpty v-if="!manifest" variant="naked" icon="i-lucide-puzzle" :title="t('app.settings.plugins.notFound', {id: plugin})"/>
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
                v-if="fields.length || !page"
                :title="t('app.settings.plugins.settings')"
                :description="manifest.description"
                :empty="fields.length ? undefined : t('app.settings.plugins.noSettings')"
                :dirty="dirty"
                data-plugin-schema
                @reset="reset"
            >
                <SettingsRow
                    v-for="field in fields"
                    :key="field.key"
                    :setting="at(field)"
                    :label="tField(field.label)"
                    :description="field.description ? tField(field.description) : undefined"
                    :info="field.info ? tField(field.info) : undefined"
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
            <PluginMount v-if="page" :key="page.id" :ui="page" :props="pageProps"/>
        </div>
    </SettingsScrollLayout>
</template>
