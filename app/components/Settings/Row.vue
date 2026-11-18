<script setup lang="ts">
import type {SettingsRowProps} from "#shared/plugin/components";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/**
 * One setting: label and description on the left, its control on the right; `stacked`, the control below at full
 * width, and without a `label` the content alone. A section's content is rows, so every one has the same padding.
 * The description is one line (cut, with the whole as its tooltip); `info` holds what takes more. With `setting`, it
 * follows the Settings window's scope: in a workspace, a setting it can't override is disabled ("Global only"), and
 * an overridden one says so with a button back to the global value. Its label is its anchor (`data-settings-label`):
 * Settings search finds a result's row by it. Published to plugins (`SettingsRowProps`).
 */
const props = defineProps<SettingsRowProps>()
const scope = useSettingsScope()
const setting = computed(() => props.setting as AppSettingPath | undefined)
const locked = computed(() => setting.value !== undefined && !scope.overridable(setting.value))
const overridden = computed(() => setting.value !== undefined && scope.overridden(setting.value))
</script>

<template>
    <div class="px-4 py-2.5 rounded-md transition-shadow" :class="stacked ? 'space-y-2' : 'flex items-center gap-4 min-h-12'" data-settings-row :data-settings-label="label">
        <!-- Beside the control, or over it: the same head either way. -->
        <div v-if="label || !stacked" :class="stacked ? 'flex items-center gap-4' : 'contents'">
            <UIcon v-if="icon" :name="icon" class="size-5 shrink-0 text-muted"/>
            <div class="flex-1 min-w-0">
                <div class="text-sm text-default flex items-center gap-1.5">
                    <span class="truncate">{{ label }}</span>
                    <SettingsInfo v-if="info" :text="info"/>
                    <UBadge v-if="overridden" size="sm" color="primary" variant="subtle" :label="$t('app.settings.scope.changed')"/>
                    <UBadge v-else-if="locked" size="sm" color="neutral" variant="subtle" :label="$t('app.settings.scope.globalOnly')"/>
                </div>
                <div v-if="error" class="text-xs text-error">{{ error }}</div>
                <div v-else-if="description" class="text-xs text-muted truncate" :title="description">{{ description }}</div>
            </div>
            <UButton
                v-if="overridden"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-undo-2"
                :label="$t('app.settings.scope.useGlobal')"
                @click="scope.reset([setting!])"
            />
        </div>
        <fieldset class="min-w-0" :class="stacked ? 'w-full' : 'shrink-0 flex items-center gap-2'" :disabled="locked">
            <slot/>
        </fieldset>
    </div>
</template>
