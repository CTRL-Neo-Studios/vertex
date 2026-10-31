<script setup lang="ts">
import {BUNDLED_FONTS, cssFontName, loadSystemFonts, type FontFamily} from "~/composables/app/useAppTheme";

/**
 * A font family picker (after Nuxt UI's ThemeStudioToolbarFontPicker): the bundled fonts first, then every
 * installed family, searchable. Rows render in their own face. Desktop fonts are already installed, so
 * unlike the studio's Google Fonts catalog nothing needs downloading.
 */
const props = defineProps<{
    /** Lists monospaced families before proportional ones (code fonts). */
    monospace?: boolean
    /** The value that wears the (Default) tag. */
    defaultValue?: string
    ariaLabel?: string
}>()

const model = defineModel<string>({required: true})

const {t} = useI18n()
const open = ref(false)
const query = ref('')
const system = ref<FontFamily[]>([])
const loading = ref(false)

// Listed on first open: the scan is cached in Rust, but a window that never opens the picker needn't ask.
watch(open, async (value) => {
    if (!value) return
    query.value = ''
    if (system.value.length) return
    loading.value = true
    system.value = await loadSystemFonts()
    loading.value = false
})

type FontItem = { label: string, value?: string, type?: 'label' }

const items = computed<FontItem[][]>(() => {
    const q = query.value.trim().toLowerCase()
    const matches = (f: FontFamily) => !q || f.name.toLowerCase().includes(q)
    const bundled = new Set(BUNDLED_FONTS.map(f => f.name))
    const installed = system.value.filter(f => !bundled.has(f.name))
    const groups: [string, FontFamily[]][] = [
        [t('app.settings.theme.fontGroups.bundled'), BUNDLED_FONTS.filter(f => f.monospace === !!props.monospace)],
        [t('app.settings.theme.fontGroups.monospace'), installed.filter(f => f.monospace)],
        [t('app.settings.theme.fontGroups.proportional'), installed.filter(f => !f.monospace)],
        // The bundled faces of the other kind are still valid picks, just not the likely ones.
        [t('app.settings.theme.fontGroups.otherBundled'), BUNDLED_FONTS.filter(f => f.monospace !== !!props.monospace)],
    ]
    if (!props.monospace) [groups[1], groups[2]] = [groups[2]!, groups[1]!]

    const listed = groups.flatMap(([, fonts]) => fonts.map(f => f.name))
    // A font that is no longer installed (or not yet loaded) stays visible as the current pick.
    const current: [string, FontFamily[]][] = listed.includes(model.value) || loading.value
        ? []
        : [[t('app.settings.theme.fontGroups.current'), [{name: model.value, monospace: !!props.monospace}]]]

    return [...current, ...groups]
        .map(([label, fonts]) => [label, fonts.filter(matches)] as const)
        .filter(([, fonts]) => fonts.length)
        .map(([label, fonts]) => [
            {label, type: 'label' as const},
            ...fonts.map(f => ({label: f.name, value: f.name})),
        ])
})

function faceOf(value?: string) {
    return value ? {fontFamily: `'${cssFontName(value)}', ${props.monospace ? 'monospace' : 'sans-serif'}`} : undefined
}
</script>

<template>
    <USelectMenu
        v-model="model"
        v-model:open="open"
        v-model:search-term="query"
        :items="items"
        value-key="value"
        ignore-filter
        :search-input="{ placeholder: t('app.settings.theme.searchFonts'), icon: 'i-lucide-search' }"
        :aria-label="ariaLabel"
        class="w-52"
        :ui="{ content: 'w-72', trailingIcon: ['transition-transform duration-200', open && 'rotate-180'] }"
    >
        <template #default>
            <span class="truncate">{{ model }}</span>
        </template>

        <template #item-label="{ item }">
            <span :style="faceOf(item.value)">{{ item.label }}</span>
            <span v-if="item.value && item.value === defaultValue" class="text-dimmed">&nbsp;{{ t('app.settings.theme.defaultTag') }}</span>
        </template>

        <template #empty>
            {{ loading ? t('app.settings.theme.loadingFonts') : t('app.settings.theme.noFonts') }}
        </template>
    </USelectMenu>
</template>
