<script setup lang="ts">
import {useAppTheme} from "~/composables/app/useAppTheme";

const appConfig = useAppConfig()
const colorMode = useColorMode()

const open = ref(false)

const {
    neutralColors,
    neutral,
    primaryColors,
    primary,
    setBlackAsPrimary,
    radiuses,
    radius,
    fonts,
    font,
    modes,
    mode,
    exportCSS,
    resetTheme
} = useAppTheme()
</script>

<template>
    <UPopover v-model:open="open" :ui="{ content: 'w-72 px-6 py-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-5rem)]' }">
        <template #default>
            <UButton
                icon="i-lucide-swatch-book"
                color="neutral"
                :variant="open ? 'soft' : 'ghost'"
                square
                aria-label="Color picker"
                :ui="{ leadingIcon: 'text-primary' }"
            />
        </template>

        <template #content>
            <fieldset>
                <UButton variant="outline" color="error" @click="resetTheme" block label="Reset Theme"/>
            </fieldset>
            <fieldset>
                <legend class="text-[11px] leading-none font-semibold mb-2 select-none flex items-center gap-1">
                    Primary

                    <UButton
                        to="/docs/getting-started/theme/css-variables#colors"
                        size="xs"
                        color="neutral"
                        variant="link"
                        icon="i-lucide-help-circle"
                        class="p-0 -my-0.5"
                        :ui="{ leadingIcon: 'size-3' }"
                    />
                </legend>

                <div class="grid grid-cols-3 gap-1 -mx-2">
                    <UtilityThemePickerButton
                        label="Black"
                        :selected="appConfig.theme.blackAsPrimary"
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
                        :selected="!appConfig.theme.blackAsPrimary && primary === color"
                        @click="primary = color"
                    />
                </div>
            </fieldset>

            <fieldset>
                <legend class="text-[11px] leading-none font-semibold mb-2 select-none flex items-center gap-1">
                    Neutral

                    <UButton
                        to="/docs/getting-started/theme/css-variables#text"
                        size="xs"
                        color="neutral"
                        variant="link"
                        icon="i-lucide-help-circle"
                        class="p-0 -my-0.5"
                        :ui="{ leadingIcon: 'size-3' }"
                    />
                </legend>

                <div class="grid grid-cols-3 gap-1 -mx-2">
                    <UtilityThemePickerButton
                        v-for="color in neutralColors"
                        :key="color"
                        :label="color"
                        :chip="color === 'neutral' ? 'old-neutral' : color"
                        :selected="neutral === color"
                        @click="neutral = color"
                    />
                </div>
            </fieldset>

            <fieldset>
                <legend class="text-[11px] leading-none font-semibold mb-2 select-none flex items-center gap-1">
                    Radius

                    <UButton
                        to="/docs/getting-started/theme/css-variables#radius"
                        size="xs"
                        color="neutral"
                        variant="link"
                        icon="i-lucide-help-circle"
                        class="p-0 -my-0.5"
                        :ui="{ leadingIcon: 'size-3' }"
                    />
                </legend>

                <div class="grid grid-cols-5 gap-1 -mx-2">
                    <UtilityThemePickerButton
                        v-for="r in radiuses"
                        :key="r"
                        :label="String(r)"
                        class="justify-center px-0"
                        :selected="radius === r"
                        @click="radius = r"
                    />
                </div>
            </fieldset>

            <fieldset>
                <legend class="text-[11px] leading-none font-semibold mb-2 select-none flex items-center gap-1">
                    Font

                    <UButton
                        to="/docs/getting-started/integrations/fonts"
                        size="xs"
                        color="neutral"
                        variant="link"
                        icon="i-lucide-help-circle"
                        class="p-0 -my-0.5"
                        :ui="{ leadingIcon: 'size-3' }"
                    />
                </legend>

                <div class="-mx-2">
                    <USelect
                        v-model="font"
                        size="sm"
                        color="neutral"
                        icon="i-lucide-type"
                        :items="fonts"
                        class="w-full ring-default rounded-sm hover:bg-elevated/50 text-[11px] data-[state=open]:bg-elevated/50"
                        :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                    />
                </div>
            </fieldset>

            <fieldset>
                <legend class="text-[11px] leading-none font-semibold mb-2 select-none flex items-center gap-1">
                    Icons

                    <UButton
                        to="/docs/getting-started/integrations/icons"
                        size="xs"
                        color="neutral"
                        variant="link"
                        icon="i-lucide-help-circle"
                        class="p-0 -my-0.5"
                        :ui="{ leadingIcon: 'size-3' }"
                    />
                </legend>
            </fieldset>

            <fieldset>
                <legend class="text-[11px] leading-none font-semibold mb-2 select-none flex items-center gap-1">
                    Color Mode

                    <UButton
                        to="/docs/getting-started/integrations/color-mode"
                        size="xs"
                        color="neutral"
                        variant="link"
                        icon="i-lucide-help-circle"
                        class="p-0 -my-0.5"
                        :ui="{ leadingIcon: 'size-3' }"
                    />
                </legend>

                <div class="grid grid-cols-3 gap-1 -mx-2">
                    <UtilityThemePickerButton
                        v-for="m in modes"
                        :key="m.label"
                        v-bind="m"
                        :selected="colorMode.preference === m.label"
                        @click="mode = m.label"
                    />
                </div>
            </fieldset>
        </template>
    </UPopover>
</template>