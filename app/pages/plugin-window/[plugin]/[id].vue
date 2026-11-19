<script setup lang="ts">
/**
 * One of a plugin's own windows (the kernel's `plugin:` label, `windows.rs`): what its plugin's `ctx.windows.define`
 * draws, with the params it was opened with and its channel to its session window, under a bar to drag it by (the
 * system's title is hidden). Only that plugin runs here (`startPlugins`), and nothing of the workspace is reachable.
 */
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow'
import {pluginWindowFromLabel} from '#shared/constants/app'
import type {WindowMessage, WindowProps} from '#shared/plugin/api'
import {pluginWindowDefs} from '~/utils/contributions'
import {windowProps} from '~/utils/plugins/windows'

const {t} = useI18n()
const window = getCurrentWebviewWindow()
const target = pluginWindowFromLabel(window.label)
const def = computed(() => target && pluginWindowDefs.get(`${target.plugin}:${target.id}`))
/** Its manifest's `bare`, which the kernel put in the URL: no bar, nothing behind the plugin's UI. */
const bare = new URL(location.href).searchParams.get('bare') === '1'
if (bare) document.documentElement.style.background = document.body.style.background = 'transparent'

/** What it was opened with: a JSON object the kernel put in the URL. */
function params(): Record<string, WindowMessage> {
    try {
        const value: unknown = JSON.parse(new URL(location.href).searchParams.get('params') ?? '{}')
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, WindowMessage> : {}
    } catch {
        return {}
    }
}

const title = ref('')
const props = shallowRef<WindowProps>()
onMounted(async () => {
    title.value = await window.title()
    props.value = await windowProps(params(), next => (title.value = next))
})
</script>

<template>
    <div class="h-screen w-full flex flex-col overflow-hidden" :class="{'bg-default': !bare}">
        <div v-if="!bare" class="shrink-0 h-10 flex items-center justify-center px-20 text-sm font-medium text-muted truncate" data-tauri-drag-region>{{ title }}</div>
        <PluginMount v-if="def && props" :ui="def" :props="props" class="min-h-0 flex-1"/>
        <p v-else-if="!def" class="p-6 text-center text-sm text-muted" data-plugin-window-missing>{{ t('app.plugins.windowMissing') }}</p>
    </div>
</template>
