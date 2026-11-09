<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useTabOutline} from "~/composables/active/editor/useActiveEditorExtensions";
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";

const {t} = useI18n()
const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const {outline: toc, activeHeading} = useTabOutline(useActiveSessions().getSession($sessionId), $tabId)
const emit = defineEmits<{
    (e: 'to-toc', value: Heading): void
}>()

</script>

<template>
    <div class="w-full h-full">
        <template v-if="$tabId && $sessionId">
            <div class="w-full grid grid-cols-1 gap-1.5">
                <UTooltip :text="t('app.editor.ui.jumpToHeading', {level: item.level})" v-for="item in toc" :key="item.from">
                    <UButton
                        :variant="item.from === activeHeading ? 'subtle' : 'soft'"
                        :color="item.from === activeHeading ? 'primary' : 'neutral'"
                        size="sm"
                        :label="item.text"
                        :icon="`i-lucide-heading-${item.level}`"
                        @click="() => emit('to-toc', item)"
                    />
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>
