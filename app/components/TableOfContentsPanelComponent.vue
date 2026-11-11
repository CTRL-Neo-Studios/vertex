<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useTabOutline} from "~/composables/active/editor/useActiveEditorExtensions";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";

const {t} = useI18n()
const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const session = useActiveSessions().getSession($sessionId)
const {outline: toc, activeHeading} = useTabOutline(session, $tabId)
const {emitToTocEntry} = useActiveEditorDispatcher(session)

const toHeading = ({from}: Heading) => emitToTocEntry({from, verticalMargin: 70, verticalScrollStrategy: 'start'})
</script>

<template>
    <div class="w-full h-full">
        <template v-if="$tabId && $sessionId">
            <div class="w-full grid grid-cols-1 gap-1.5">
                <!-- By position: typing above a heading shifts every `from` below it, and a `from` key remounted those rows. -->
                <UTooltip :text="t('app.editor.ui.jumpToHeading', {level: item.level})" v-for="(item, i) in toc" :key="i">
                    <UButton
                        :variant="item.from === activeHeading ? 'subtle' : 'soft'"
                        :color="item.from === activeHeading ? 'primary' : 'neutral'"
                        size="sm"
                        :label="item.text"
                        :icon="`i-lucide-heading-${item.level}`"
                        @click="toHeading(item)"
                    />
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>
