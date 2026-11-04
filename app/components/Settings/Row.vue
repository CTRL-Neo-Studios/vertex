<script setup lang="ts">
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/**
 * One setting: label and description on the left, its control on the right. With `setting`, it follows the
 * Settings window's scope: in a workspace, a setting it can't override is disabled ("Global only"), and an
 * overridden one says so with a button back to the global value.
 */
const props = defineProps<{
    label: string
    description?: string
    /** Replaces the description, in the error color. */
    error?: string
    setting?: AppSettingPath
}>()
const scope = useSettingsScope()
const locked = computed(() => props.setting !== undefined && !scope.overridable(props.setting))
const overridden = computed(() => props.setting !== undefined && scope.overridden(props.setting))
</script>

<template>
    <div class="flex items-center gap-4 px-4 py-2.5 min-h-12">
        <div class="flex-1 min-w-0">
            <div class="text-sm text-default flex items-center gap-1.5">
                {{ label }}
                <UBadge v-if="overridden" size="sm" color="primary" variant="subtle" :label="$t('app.settings.scope.changed')"/>
                <UBadge v-else-if="locked" size="sm" color="neutral" variant="subtle" :label="$t('app.settings.scope.globalOnly')"/>
            </div>
            <div v-if="error" class="text-xs text-error">{{ error }}</div>
            <div v-else-if="description" class="text-xs text-muted">{{ description }}</div>
        </div>
        <UButton
            v-if="overridden"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-undo-2"
            :label="$t('app.settings.scope.useGlobal')"
            @click="scope.reset([props.setting!])"
        />
        <fieldset class="shrink-0 flex items-center gap-2 min-w-0" :disabled="locked">
            <slot/>
        </fieldset>
    </div>
</template>
