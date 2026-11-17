<script setup lang="ts">
import type {ScopedConfig, SettingsPageProps} from "#shared/plugin/api";
import {getAt} from "#shared/utils/settings/paths";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {settingsPages} from "~/utils/contributions";
import {contributionPlugin} from "~/utils/plugins/runtime";

definePageMeta({
    layout: 'settings'
})

/**
 * A registered settings page (`settingsPages`), at `/settings/<id>/…`; it gets the route below its id as `path`, and
 * its plugin's config in the scope being edited as `config`. The kernel's own pages are file routes, which the router
 * ranks before this one.
 */
const $route = useRoute()
const scope = useSettingsScope()
const segments = computed(() => [$route.params.path ?? []].flat())
const page = computed(() => settingsPages.get(segments.value[0]))

/** `plugin`'s config through the Settings window's scope: paths inside it become `plugins.config.<plugin>.<path>`. */
function scopedConfig(plugin: string): ScopedConfig {
    const at = (path: string) => `plugins.config.${plugin}.${path}` as const
    const setting = (path: string) => at(path) as AppSettingPath
    return {
        get root() { return scope.root.value },
        get trusted() { return scope.trusted.value },
        get effective() { return (getAt(scope.effective.value, `plugins.config.${plugin}`) ?? {}) as Record<string, unknown> },
        value: path => scope.value(setting(path)),
        set: patch => scope.set(Object.fromEntries(Object.entries(patch).map(([path, v]) => [at(path), v]))),
        overridden: path => scope.overridden(setting(path)),
        isDirty: (paths, defaults) => (scope.root.value
            ? paths.some(path => scope.overridden(setting(path)))
            : paths.some(path => JSON.stringify(scope.value(setting(path))) !== JSON.stringify(getAt(defaults, path)))),
        reset: (paths, defaults) => scope.set(Object.fromEntries(paths.map(path => [at(path), scope.root.value ? null : getAt(defaults, path)]))),
        path: at,
    }
}

const props = computed<SettingsPageProps | undefined>(() => {
    const plugin = page.value && contributionPlugin(page.value)
    return plugin ? {path: segments.value.slice(1), config: scopedConfig(plugin)} : undefined
})
</script>

<template>
    <PluginMount v-if="page && props" :key="page.id" :ui="page" :props="props"/>
</template>
