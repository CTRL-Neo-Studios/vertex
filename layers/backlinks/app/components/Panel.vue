<script setup lang="ts">
import type {PanelViewProps} from "#shared/plugin/api";

const props = defineProps<PanelViewProps>()

// The files linking to the shown tab's file.
const links = computed(() => {
    const tabId = props.session.tabs.active()
    return tabId ? props.session.index.backlinks(tabId).flatMap(uuid => props.session.index.byUuid(uuid) ?? []) : []
})
</script>

<template>
    <div class="w-full h-full select-none">
        <div v-if="links.length" class="flex flex-col items-center justify-start gap-1.5">
            <UTooltip :text="file.relativePath" v-for="file in links" :key="file.uuid" :delay-duration="300">
                <UButton @click="session.tabs.open(file.uuid)" variant="soft" class="w-full" color="neutral" size="sm" :label="file.fileName"/>
            </UTooltip>
        </div>
        <div v-else class="w-full h-full inline-flex items-center justify-center">
            <span class="text-dimmed text-xs select-none">{{ $t('plugins.backlinks.empty') }}</span>
        </div>
    </div>
</template>
