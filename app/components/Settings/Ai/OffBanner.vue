<script setup lang="ts">
import {Routes} from "#shared/constants/app";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/** Shown on the Assistive AI pages while AI is off (`aiConfig.enabled`), with the way to its switch. */
const {effective} = useSettingsScope()
</script>

<template>
    <UAlert
        v-if="effective && !effective.aiConfig.enabled"
        color="warning"
        variant="subtle"
        icon="i-lucide-power-off"
        :title="$t('app.settings.ai.off')"
        :actions="[{label: $t('app.settings.ai.turnOn'), color: 'warning', variant: 'outline', to: `${Routes.settings}/ai/features`}]"
    />
</template>
