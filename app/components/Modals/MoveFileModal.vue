<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import FileTreeComponent from "#build/types/components";
const props = defineProps<{
    modalTitle?: string,
    atFileIndexId: string,
    asFolder: boolean,
    isFolder: boolean,
    asLevel: "above" | "same" | "below",
    fileExt?: string,
}>()
const emit = defineEmits<{ close: [boolean] }>()

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    getSession
} = useActiveSessions()
const $wt = useActiveWorkspaceTools(getSession($sessionId))
const $qt = useQuickToasts()

const selectedFolder = ref<string>('')
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="props?.modalTitle ?? 'New File'"
        size="sm"
    >
        <template #body>
            <FileTreeComponent v-model="selectedFolder" only-folders no-context-menu class="w-full h-full" />
        </template>
    </UModal>
</template>

<style scoped>

</style>