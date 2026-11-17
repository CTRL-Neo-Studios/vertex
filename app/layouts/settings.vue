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

const {t, locale} = useI18n()
const $route = useRoute()
const scope = useSettingsScope()
const {appSessions} = useAppSessions()

/** Vertex's own pages, then Core plugins and Community plugins (`pluginNavGroups`), each group under its heading. */
const links = computed<NavigationMenuItem[][]>(() => {
    const {core, community} = pluginNavGroups(
        [...settingsPages.items.values()].map(def => ({def, owner: contributionPlugin(def)})),
        scopeEntries().map(entry => ({entry, on: pluginEnabled(entry.manifest, scope.effective.value?.plugins.enabled ?? {})})),
        {t, locale: locale.value, base: Routes.settings, path: $route.path},
    )
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
                    <div class="sticky top-0 z-10 bg-submuted pb-1 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-linear-to-b after:from-submuted after:to-transparent">
                        <UFormField :label="t('app.settings.scope.label')" size="xs">
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
                    <UNavigationMenu
                        class="mt-3"
                        :items="links"
                        orientation="vertical"
                        tooltip
                        popover
                    />
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
