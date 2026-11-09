<script setup lang="ts">
import type {MaybeRefOrGetter} from "vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_ACTIONS, panelViewComponent, panelViews, type PanelViewAction} from "~/utils/panelViews";

/**
 * A panel view open in a tab (`ActiveTab.kind: 'view'`): a header with its name, the actions it declares (it fills
 * this tab's own `PANEL_ACTIONS` slot, as it does its pane's) and Move to panel; then the view, full-size.
 */
const props = defineProps<{ viewId: string }>()

const {t} = useI18n()
const $route = useRoute()
const panels = usePanels(useActiveSessions().getSession(computed(() => $route.params.sessionId as string)))
const view = computed(() => panelViews.get(props.viewId))
const component = computed(() => panelViewComponent(props.viewId))

const slot = shallowRef<MaybeRefOrGetter<PanelViewAction[]>>()
provide(PANEL_ACTIONS, slot)
const actions = computed(() => toValue(slot.value) ?? [])
</script>

<template>
    <div class="h-full min-h-0 flex flex-col">
        <div class="flex items-center gap-1 px-3 h-10 shrink-0 border-b border-default">
            <UIcon v-if="view" :name="view.icon" class="size-4 shrink-0 text-muted"/>
            <span class="ps-1 text-sm font-medium truncate">{{ view ? t(view.label) : viewId }}</span>
            <UTooltip v-for="action in actions" :key="action.id" :text="action.label" :content="{ side: 'bottom' }">
                <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" @click="action.onSelect()"/>
            </UTooltip>
            <div class="flex-1"/>
            <UTooltip :text="t('app.panels.moveToPanel')" :content="{ side: 'bottom' }">
                <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="text-muted"
                    icon="i-lucide-square-arrow-out-up-right"
                    :aria-label="t('app.panels.moveToPanel')"
                    @click="panels.moveToPanel(viewId)"
                />
            </UTooltip>
        </div>
        <div class="relative flex-1 min-h-0 flex flex-col">
            <component :is="component" v-if="component"/>
            <UEmpty v-else variant="naked" size="sm" icon="i-lucide-square-dashed" class="h-full" :title="t('app.panels.viewMissing')"/>
        </div>
    </div>
</template>
