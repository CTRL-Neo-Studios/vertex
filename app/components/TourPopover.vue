<script setup lang="ts">
import type {Tour} from "~/composables/utility/useTour";

/** Draws a `useTour` tour: a popover at the current step's target, which is outlined (`.tour-target`) meanwhile. */
const props = defineProps<{ tour: Tour }>()
const {t} = useI18n()
const {step, index, count, target} = props.tour

watch(target, (now, before) => {
    before?.classList.remove('tour-target')
    now?.classList.add('tour-target')
    now?.scrollIntoView({block: 'nearest'})
})
onBeforeUnmount(() => target.value?.classList.remove('tour-target'))
</script>

<template>
    <UPopover
        :open="!!step"
        :reference="target"
        :content="{ side: 'right', align: 'start', collisionPadding: 12 }"
        arrow
        @update:open="open => !open && props.tour.stop()"
    >
        <template #content>
            <div v-if="step" class="w-64 p-3 flex flex-col gap-2" data-tour>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-highlighted">{{ step.title }}</span>
                    <span class="ms-auto text-xs text-dimmed tabular-nums">{{ t('app.tour.progress', {step: index + 1, count}) }}</span>
                </div>
                <p class="text-sm text-muted">{{ step.description }}</p>
                <div class="flex items-center gap-1.5 pt-1">
                    <UButton size="xs" color="neutral" variant="ghost" :label="t('app.tour.skip')" @click="props.tour.stop()"/>
                    <UButton v-if="index > 0" class="ms-auto" size="xs" color="neutral" variant="outline" :label="t('app.tour.back')" @click="props.tour.back()"/>
                    <UButton :class="index > 0 ? '' : 'ms-auto'" size="xs" :label="index + 1 < count ? t('app.tour.next') : t('app.tour.done')" autofocus @click="props.tour.next()"/>
                </div>
            </div>
        </template>
    </UPopover>
</template>
