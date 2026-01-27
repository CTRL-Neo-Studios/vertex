<script setup lang="ts">
import {useAppTheme} from "~/composables/app/useAppTheme";
import {useAppSettings} from "~/composables/app/useAppSettings";

const appConfig = useAppConfig()
const colorMode = useColorMode()
const $settings = useAppSettings()

const open = ref(false)
const saving = defineModel<boolean>({default: false})

const {
    neutralColors,
    neutral,
    primaryColors,
    primary,
    setBlackAsPrimary,
    radiuses,
    radius,
    fonts,
    appFont,
    appMonoFont,
    editorFont,
    editorMonoFont,
    modes,
    mode,
    resetTheme,
    saveTheme
} = useAppTheme()

// Debounced save to prevent recursive loops
const saveTimeout = ref<ReturnType<typeof setTimeout>>()

async function save() {
    // Clear any pending save
    if (saveTimeout.value) {
        clearTimeout(saveTimeout.value)
    }
    
    // Debounce the save operation
    saveTimeout.value = setTimeout(async () => {
        saving.value = true
        await $settings.save() // Just save, don't call saveTheme() which calls $settings.set() again
        saving.value = false
    }, 100) // 500ms debounce
}

// Watch for theme changes and auto-save
// Note: Individual setters already call $settings.set(), so we just need to save to disk
watch(() => unref($settings.config)?.themeConfig, () => {
    save()
}, { deep: true })
</script>

<template>
    <div class="space-y-4">
        <fieldset class="grid grid-cols-1 gap-3">
            <UButton variant="outline" color="error" @click="resetTheme" block label="Reset Theme"/>
        </fieldset>
        <UPageCard title="Colors & Modes" :ui="{ container: 'space-y-4' }">
            <UFormField label="Primary Colors" description="The primary color of the app.">
                <div class="grid grid-cols-3 gap-1">
                    <UtilityThemePickerButton
                        label="Black"
                        :color="(appConfig.theme.blackAsPrimary) ? 'primary' : 'neutral'"
                        :variant="(appConfig.theme.blackAsPrimary) ? 'solid' : 'outline'"
                        @click="setBlackAsPrimary(true)"
                    >
                        <template #leading>
                            <span class="inline-block w-2 h-2 rounded-full bg-black dark:bg-white" />
                        </template>
                    </UtilityThemePickerButton>

                    <UtilityThemePickerButton
                        v-for="color in primaryColors"
                        :key="color"
                        :label="color"
                        :chip="color"
                        :color="(!appConfig.theme.blackAsPrimary && primary == color) ? 'primary' : 'neutral'"
                        :variant="(!appConfig.theme.blackAsPrimary && primary == color) ? 'solid' : 'outline'"
                        @click="primary = color"
                        :style="{
                            '--color-light': `var(--color-${color}-500)`,
                            '--color-dark': `var(--color-${color}-400)`
                        }"
                    />
                </div>
            </UFormField>
            <UFormField label="Neutral Colors" description="The neutral color of the app.">
                <div class="grid grid-cols-3 gap-1">
                    <UtilityThemePickerButton
                        v-for="color in neutralColors"
                        :key="color"
                        :label="color"
                        :chip="color === 'neutral' ? 'old-neutral' : color"
                        :color="(neutral == color) ? 'neutral' : 'neutral'"
                        :variant="(neutral == color) ? 'solid' : 'outline'"
                        @click="neutral = color"
                    />
                </div>
            </UFormField>
            <UFormField label="Radius" description="The corner radius of certain UI elements.">
                <div class="grid grid-cols-3 gap-1">
                    <UtilityThemePickerButton
                        v-for="r in radiuses"
                        :key="r"
                        :label="String(r)"
                        class="justify-center px-0"
                        :variant="(radius == r) ? 'solid' : 'outline'"
                        @click="radius = r"
                    />
                </div>
            </UFormField>
            <UFormField label="Color Mode" description="The color mode of the app." orientation="horizontal">
                <div class="grid grid-cols-3 gap-1">
                    <UtilityThemePickerButton
                        v-for="m in modes"
                        :key="m.label"
                        v-bind="m"
                        :selected="colorMode.preference === m.label"
                        :variant="colorMode.preference === m.label ? 'solid' : 'outline'"
                        @click="mode = m.label"
                    />
                </div>
            </UFormField>
        </UPageCard>

        <UPageCard title="Fonts" class="space-y-3 grid grid-cols-1 gap-3" :ui="{ container: 'space-y-4' }">
            <UFormField label="App Font" description="The app's font." orientation="horizontal">
                <USelect
                    v-model="appFont"
                    size="sm"
                    color="neutral"
                    icon="i-lucide-type"
                    :items="fonts"
                    class="w-full font-sans ring-default rounded-sm hover:bg-elevated/50 text-[11px] data-[state=open]:bg-elevated/50"
                    :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                />
            </UFormField>
            <UFormField label="App Mono Font" description="The app's monospace font." orientation="horizontal">
                <USelect
                    v-model="appMonoFont"
                    size="sm"
                    color="neutral"
                    icon="i-lucide-type"
                    :items="fonts"
                    class="w-full font-mono ring-default rounded-sm hover:bg-elevated/50 text-[11px] data-[state=open]:bg-elevated/50"
                    :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                />
            </UFormField>
            <UFormField label="Editor Font" description="The text editor's font." orientation="horizontal">
                <USelect
                    v-model="editorFont"
                    size="sm"
                    color="neutral"
                    icon="i-lucide-type"
                    :items="fonts"
                    class="w-full font-editor ring-default rounded-sm hover:bg-elevated/50 text-[11px] data-[state=open]:bg-elevated/50"
                    :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                />
            </UFormField>
            <UFormField label="Editor Code Font" description="The text editor's monospace font." orientation="horizontal">
                <USelect
                    v-model="editorMonoFont"
                    size="sm"
                    color="neutral"
                    icon="i-lucide-type"
                    :items="fonts"
                    class="w-full font-editor-code ring-default rounded-sm hover:bg-elevated/50 text-[11px] data-[state=open]:bg-elevated/50"
                    :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                />
            </UFormField>
        </UPageCard>
    </div>
</template>