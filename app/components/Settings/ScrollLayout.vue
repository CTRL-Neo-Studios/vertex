<script setup lang="ts">
import type {SettingsScrollLayoutProps} from "#shared/plugin/components";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/**
 * Settings page scroll layout
 * Provides scrollable content area with sticky header. A `globalOnly` page is read-only while the Settings
 * window edits a workspace: none of its settings can be overridden there. Published to plugins.
 */

const props = defineProps<SettingsScrollLayoutProps>()
const scope = useSettingsScope()
const locked = computed(() => props.globalOnly && scope.root.value !== null)
</script>

<template>
    <div class="relative w-full h-screen overflow-hidden">
        <!-- Header over the content, which fades out under it as a note does under its header. -->
        <div class="absolute inset-x-0 top-0 z-10 bg-linear-to-b from-default from-60% to-transparent" data-tauri-drag-region>
            <div class="px-6 pt-4 pb-6" data-tauri-drag-region>
                <div class="flex items-center justify-between gap-2" data-tauri-drag-region>
                    <div class="flex items-center gap-1 min-w-0" data-tauri-drag-region>
                        <slot name="header-leading"/>
                        <h1 class="font-semibold select-none truncate">{{ title ?? $t('app.settings.title') }}</h1>
                    </div>
                    <div class="flex items-center gap-2 h-8">
                        <slot name="header-trailing"/>
                    </div>
                </div>
            </div>
        </div>

        <!-- Scrollable content: under the header, with room at the bottom. -->
        <UScrollArea class="h-full w-full" orientation="vertical">
            <div class="px-6 pt-18 pb-24">
                <UAlert
                    v-if="locked"
                    class="mb-4"
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-globe"
                    :title="$t('app.settings.scope.globalOnlyPage')"
                    :actions="[{label: $t('app.settings.scope.editUser'), color: 'neutral', variant: 'outline', onClick: () => scope.open(null)}]"
                />
                <fieldset :disabled="locked" :class="locked && 'opacity-60'">
                    <slot/>
                </fieldset>
            </div>
        </UScrollArea>
    </div>
</template>
