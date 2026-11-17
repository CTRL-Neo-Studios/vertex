<script setup lang="ts">
import {aiConfigOf} from "../../shared/config"
import {aiContext} from "../plugin"

/** Shown on the Assistive AI pages while AI is off (its config's `enabled`), with the way to its switch. */
const enabled = computed(() => aiConfigOf(aiContext().config.value).enabled)
</script>

<template>
    <UAlert
        v-if="!enabled"
        color="warning"
        variant="subtle"
        icon="i-lucide-power-off"
        :title="$t('plugins.ai.off')"
        :actions="[{label: $t('plugins.ai.turnOn'), color: 'warning', variant: 'outline', to: '/settings/ai/features'}]"
    />
</template>
