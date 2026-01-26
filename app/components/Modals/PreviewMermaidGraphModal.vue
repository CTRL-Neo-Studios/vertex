<script setup lang="ts">
import VueMermaidString from "vue-mermaid-string";
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";

const props = defineProps<{
    codeContent?: string
}>()
const emit = defineEmits<{ close: [boolean] }>()

</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        title="Preview Mermaid Graph"
        fullscreen
        :ui="{body: 'p-0 m-0'}"
    >
        <template #body>
            <ScrollAreaRoot
                class="w-full max-h-svh flex flex-col relative"
            >
                <ScrollAreaViewport class="w-full flex-none h-full">
                    <VueMermaidString class="w-auto h-auto" :value="props?.codeContent || ''"/>
                </ScrollAreaViewport>
                <ScrollAreaScrollbar
                    class="select-none touch-none z-20 w-2 m-2 pointer-events-none"
                    orientation="vertical"
                >
                    <ScrollAreaThumb
                        class="flex-1 bg-accented rounded-lg"
                    />
                </ScrollAreaScrollbar>
                <ScrollAreaScrollbar
                    class="select-none touch-none z-20 h-2 m-2 pointer-events-none"
                    orientation="horizontal"
                >
                    <ScrollAreaThumb
                        class="flex-1 bg-accented rounded-lg"
                    />
                </ScrollAreaScrollbar>
            </ScrollAreaRoot>
        </template>
    </UModal>
</template>

<style scoped>

</style>