<script setup lang="ts">
import type {MaybeRefOrGetter} from "vue";
import type {PanelViewAction, PanelViewProps, TabProps} from "#shared/plugin/api";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_ACTIONS, panelViews} from "~/utils/panelViews";

/**
 * A panel view open in a tab (tab kind `view`, the tab id is the view id): a header with its name, the actions it
 * declares (it fills this tab's own `PANEL_ACTIONS` slot, as it does its pane's) and Move to panel; then the view,
 * full-size.
 */
const props = defineProps<TabProps>()

const {t} = useI18n()
const panels = usePanels(props.session.session)
const view = computed(() => panelViews.get(props.id))

const slot = shallowRef<MaybeRefOrGetter<PanelViewAction[]>>()
provide(PANEL_ACTIONS, slot)
const actions = computed(() => toValue(slot.value) ?? [])
const viewProps = computed<PanelViewProps>(() => ({
    session: props.session,
    placement: 'tab',
    actions: list => {
        slot.value = list
    },
}))
</script>

<template>
    <div class="h-full min-h-0 flex flex-col">
        <div class="flex items-center gap-1 px-3 h-10 shrink-0 border-b border-default">
            <UIcon v-if="view" :name="view.icon" class="size-4 shrink-0 text-muted"/>
            <span class="ps-1 text-sm font-medium truncate">{{ view ? t(view.label) : id }}</span>
            <UTooltip v-for="action in actions" :key="action.id" :text="action.label" :content="{ side: 'bottom' }">
                <UButton color="neutral" variant="ghost" size="xs" class="text-muted" :icon="action.icon" :aria-label="action.label" :disabled="action.disabled" :data-panel-action="action.id" @click="action.onSelect()"/>
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
                    @click="panels.moveToPanel(id)"
                />
            </UTooltip>
        </div>
        <div class="relative flex-1 min-h-0 flex flex-col">
            <PluginMount v-if="view && (view.component || view.mount)" :ui="view" :props="viewProps"/>
            <UEmpty v-else variant="naked" size="sm" icon="i-lucide-square-dashed" class="h-full" :title="t('app.panels.viewMissing')"/>
        </div>
    </div>
</template>
