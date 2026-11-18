<script setup lang="ts">
import type {NavigationMenuItem} from "#ui/components/NavigationMenu.vue";
import {getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";
import {SplitterGroup, SplitterPanel, SplitterResizeHandle} from "reka-ui";
import {Routes} from "#shared/constants/app";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {SETTINGS_ROUTE_EVENT, SETTINGS_SCOPE_EVENT} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {pluginEnabled} from "#shared/plugin/resolve";
import {scopeEntries} from "~/utils/plugins/catalog";
import {contributionPlugin} from "~/utils/plugins/runtime";
import {settingsPages} from "~/utils/contributions";
import {pluginNavGroups} from "~/utils/settingsNav";
import {settingsSearchGroups} from "~/utils/settingsSearch";
import {settingsIndex} from "#build/settings-index.mjs";
import {platform} from "@tauri-apps/plugin-os";

const {t, te, locale} = useI18n()
const $route = useRoute()
const scope = useSettingsScope()
const {appSessions} = useAppSessions()

const navPages = computed(() => [...settingsPages.items.values()].map(def => ({def, owner: contributionPlugin(def)})))
const navPlugins = computed(() => scopeEntries().map(entry => ({entry, on: pluginEnabled(entry.manifest, scope.effective.value?.plugins.enabled ?? {})})))

/** Vertex's own pages, then Core plugins and Community plugins (`pluginNavGroups`), each group under its heading. */
const links = computed<NavigationMenuItem[][]>(() => {
    const {core, community} = pluginNavGroups(navPages.value, navPlugins.value, {t, locale: locale.value, base: Routes.settings, path: $route.path})
    return [
        [
            {label: t('app.settings.nav.about'), icon: 'i-lucide-info', to: Routes.settings},
            {label: t('app.settings.nav.general'), icon: 'i-lucide-settings', to: `${Routes.settings}/general`},
            {label: t('app.settings.nav.theme'), icon: 'i-lucide-palette', to: `${Routes.settings}/theme`},
            {label: t('app.settings.nav.view'), icon: 'i-lucide-layout-grid', to: `${Routes.settings}/view`},
            {label: t('app.settings.nav.trust'), icon: 'i-lucide-shield-check', to: `${Routes.settings}/trust`},
            {label: t('app.settings.nav.plugins'), icon: 'i-lucide-puzzle', to: `${Routes.settings}/plugins`, active: $route.path === `${Routes.settings}/plugins`},
        ],
        ...[{label: t('app.settings.plugins.core'), items: core}, {label: t('app.settings.plugins.community'), items: community}]
            .filter(group => group.items.length)
            .map(group => [{label: group.label, type: 'label' as const}, ...group.items]),
    ]
})

// User, or a workspace this app has opened. Select items need a non-empty value; a root is an absolute path.
const USER = 'user'
const scopes = computed(() => {
    const roots = new Set(appSessions.value.flatMap(s => (s.sessionType === 'workspace' && s.rootFileOrFolderAbsolutePath ? [s.rootFileOrFolderAbsolutePath] : [])))
    if (scope.root.value) roots.add(scope.root.value)
    return [
        {label: t('app.settings.scope.user'), value: USER, icon: 'i-lucide-user'},
        ...[...roots].map(root => ({label: fileNameFromPath(root), value: root, icon: 'i-lucide-folder'})),
    ]
})
const choose = (root: string | null) => scope.open(root === USER ? null : root).catch(e => console.error('[settings] could not open scope', e))

const unlisten: (() => void)[] = []
onBeforeUnmount(() => unlisten.forEach(stop => stop()))
onMounted(async () => {
    await choose(typeof $route.query.scope === 'string' ? $route.query.scope : null)
    // Settings opened again from another window: switch to that window's scope, and to the page it asked for.
    const window = getCurrentWebviewWindow()
    unlisten.push(await window.listen<string | null>(SETTINGS_SCOPE_EVENT, e => choose(e.payload)))
    unlisten.push(await window.listen<string>(SETTINGS_ROUTE_EVENT, e => void navigateTo(e.payload)))
})

/**
 * Settings search (Settings Plan, U7): while there's a query, its results replace the nav, grouped by page and matched
 * in the UI's language and in English. ⌘F focuses it; Esc clears it; Enter opens the highlighted result.
 */
const term = ref('')
const mod = platform() === 'macos' ? '⌘' : 'Ctrl'
const translate = (key: string, english = false) => (te(key, english ? 'en' : undefined) ? t(key, {mod}, english ? {locale: 'en'} : {}) : key)
const searchGroups = computed(() => (term.value.trim()
    ? settingsSearchGroups(settingsIndex, {t: key => translate(key), en: key => translate(key, true), pages: navPages.value, plugins: navPlugins.value, base: Routes.settings})
        .map(group => ({...group, items: group.items.map(item => ({...item, onSelect: () => (term.value = '')}))}))
    : []))
defineShortcuts({meta_f: () => document.querySelector<HTMLInputElement>('[data-settings-search] input')?.focus()})

/** A result opened its page with `find` (and `in`, its section): that row, or section, scrolled to and marked. */
watch(() => [$route.path, $route.query.find, $route.query.in], async ([, find, within]) => {
    if (typeof find !== 'string') return
    const selector = (attr: string, text: string) => `[${attr}=${JSON.stringify(text)}]`
    let target: Element | null = null
    for (let tries = 0; tries < 40 && !target; tries++) {
        const scopeEl = typeof within === 'string' ? document.querySelector(selector('data-settings-title', within)) : document
        target = scopeEl?.querySelector(selector('data-settings-label', find)) ?? document.querySelector(selector('data-settings-title', find))
        if (!target) await new Promise(r => setTimeout(r, 75))
    }
    void navigateTo({path: $route.path, query: {...$route.query, find: undefined, in: undefined}}, {replace: true})
    if (!target) return
    target.scrollIntoView({block: 'center', behavior: 'smooth'})
    target.classList.add('ring-2', 'ring-primary')
    setTimeout(() => target.classList.remove('ring-2', 'ring-primary'), 1600)
}, {immediate: true})
</script>

<template>
    <div class="w-full h-screen max-h-screen overflow-hidden">
        <!-- The sidebar's width is kept (`localStorage`) for every Settings window. -->
        <SplitterGroup direction="horizontal" auto-save-id="vertex-settings-sidebar" class="w-full h-full">
            <!-- Sidebar -->
            <SplitterPanel id="settings-sidebar" :order="0" :default-size="25" :min-size="15" :max-size="45" class="bg-submuted h-full overflow-hidden flex flex-col" data-tauri-drag-region>
                <SpaceOnOs detectOs="macos" showOnOs class="h-(--ui-header-height) shrink-0"/>

                <div class="w-full flex-1 min-h-0 overflow-y-auto px-4 pb-12">
                    <!-- The scope stays at the top; the nav fades out under it as it scrolls, as a note does under its header. -->
                    <!-- `pt-1`: the scroll area clips at its top edge, and the focused field's ring sits outside its border. -->
                    <div class="sticky top-0 z-10 bg-submuted pt-1 pb-1 space-y-2 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-linear-to-b after:from-submuted after:to-transparent">
                        <UCommandPalette
                            v-model:search-term="term"
                            :groups="searchGroups"
                            :autofocus="false"
                            :placeholder="t('app.settings.search.placeholder')"
                            :fuse="{fuseOptions: {keys: ['label', 'suffix', 'also'], ignoreLocation: true, threshold: 0.2}, resultLimit: 50, matchAllWhenSearchEmpty: false}"
                            :input="{size: 'sm', variant: 'soft'}"
                            :ui="{root: 'bg-transparent divide-y-0', input: '[&>input]:h-8 border-0 px-0', content: term ? 'max-h-[calc(100vh-11rem)] overflow-y-auto' : 'hidden', group: 'p-0', item: 'px-1.5'}"
                            data-settings-search
                            @keydown.esc="term = ''"
                        >
                            <template #empty>
                                <p class="py-3 text-xs text-muted text-center">{{ t('app.settings.search.noResults') }}</p>
                            </template>
                        </UCommandPalette>
                        <UFormField v-show="!term" :label="t('app.settings.scope.label')" size="xs">
                            <UTooltip :text="t('app.settings.scope.help')" :delay-duration="100" :content="{side: 'right'}">
                                <USelect
                                    class="w-full"
                                    size="sm"
                                    :items="scopes"
                                    :model-value="scope.root.value ?? USER"
                                    :icon="scope.root.value ? 'i-lucide-folder' : 'i-lucide-user'"
                                    @update:model-value="choose($event as string)"
                                />
                            </UTooltip>
                        </UFormField>
                    </div>
                    <div v-show="!term">
                        <UNavigationMenu
                            class="mt-3"
                            :items="links"
                            orientation="vertical"
                            tooltip
                            popover
                        />
                    </div>
                </div>
            </SplitterPanel>
            <SplitterResizeHandle
                class="relative shrink-0 w-px bg-default transition-colors data-[state=hover]:bg-primary data-[state=drag]:bg-primary after:absolute after:inset-y-0 after:-inset-x-1.5 cursor-ew-resize"
            />

            <!-- Content area (non-scrollable container) -->
            <SplitterPanel id="settings-content" :order="1" :min-size="40" class="h-screen">
                <slot/>
            </SplitterPanel>
        </SplitterGroup>
    </div>
</template>
