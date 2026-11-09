<script setup lang="ts">
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/**
 * Settings page scroll layout
 * Provides scrollable content area with sticky header. A `globalOnly` page is read-only while the Settings
 * window edits a workspace: none of its settings can be overridden there.
 */

const props = defineProps<{
    title?: string,
    globalOnly?: boolean,
}>()
const scope = useSettingsScope()
const locked = computed(() => props.globalOnly && scope.root.value !== null)
</script>

<template>
    <div class="w-full h-screen flex flex-col overflow-hidden">
        <!-- Fixed Header -->
        <div class="shrink-0 border-b border-default bg-default/75 backdrop-blur-lg z-10 w-full" data-tauri-drag-region>
            <div class="px-6 py-4" data-tauri-drag-region>
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

        <!-- Scrollable Content (takes remaining height) -->
        <div class="flex-1 overflow-hidden">
            <UScrollArea class="h-full w-full p-6" orientation="vertical">
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
            </UScrollArea>
        </div>
    </div>
</template>
