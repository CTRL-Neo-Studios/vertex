<script setup lang="ts">
import {SplitterGroup, SplitterPanel, SplitterResizeHandle} from "reka-ui";
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import DashboardBottomPanel from "~/components/LayoutComponents/DashboardBottomPanel.vue";
import {usePanels} from "~/composables/active/usePanels";
import {useActiveSessions} from "~/composables/active/useActiveSessions";

const $route = useRoute()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {areas} = usePanels($sesh.getSession($sessionId))

const panelsCollapsed = computed(() => !areas.value.left.open && !areas.value.right.open)
const bottom = computed(() => areas.value.bottom)
</script>

<template>
    <UDashboardPanel
        id="content"
        :ui="{
            body: `relative sm:p-0 bg-default border-default overflow-visible ${panelsCollapsed ? 'border-0' : 'border-0 shadow-none shadow-neutral'}`,
            root: `lg:not-last:${(!areas.left.open && !areas.right.open) ? 'border-none' : 'border-r'}`,
        }"
    >
        <template #header>
            <UDashboardNavbar :toggle="false" :ui="{ root: 'border-none h-(--ui-header-height) sm:p-0 p-0 w-full gap-0', center: 'flex w-full h-full p-0 sm:p-0 m-0 sm:m-0 gap-0', left: 'pl-0 gap-0', right: 'pr-0 gap-0' }" data-tauri-drag-region>
                <template #default>
                    <TabsHeaderComponent/>
                </template>
            </UDashboardNavbar>
        </template>
        <template #body>
            <!-- The page always sits in the first panel, so opening or closing the bottom area never remounts the editor.
            Its height is kept per set of panels (`localStorage`), for every window. -->
            <div class="h-full flex flex-col">
                <SplitterGroup direction="vertical" auto-save-id="vertex-bottom" class="flex-1 min-h-0">
                    <SplitterPanel id="content" :order="0" :min-size="20" class="relative">
                        <slot/>
                    </SplitterPanel>
                    <template v-if="bottom.open">
                        <SplitterResizeHandle
                            class="relative shrink-0 h-px bg-default transition-colors data-[state=hover]:bg-primary data-[state=drag]:bg-primary after:absolute after:inset-x-0 after:-inset-y-1.5 cursor-ns-resize"
                        />
                        <SplitterPanel id="bottom" :order="1" :min-size="10" :default-size="30">
                            <DashboardBottomPanel/>
                        </SplitterPanel>
                    </template>
                </SplitterGroup>
                <DashboardBottomPanel v-if="bottom.panes.length && !bottom.open" collapsed class="shrink-0"/>
            </div>
        </template>
    </UDashboardPanel>
</template>
