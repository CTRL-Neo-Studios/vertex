<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import {isValidFilename} from "#shared/utils/fs/filenames";
import {computed} from "vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import useQuickToasts from "~/composables/utility/useQuickToasts";
const props = defineProps<{
    modalTitle?: string,
    fileIndexIds: string[],
}>()
const emit = defineEmits<{ close: [boolean] }>()

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    getSession
} = useActiveSessions()
const $wt = useActiveWorkspaceTools(getSession($sessionId))
const $qt = useQuickToasts()

const deleting = ref(false)

async function onDelete() {
    deleting.value = true
    await $wt.deleteFiles(props.fileIndexIds);
    deleting.value = false
    emit('close', false)
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="props?.modalTitle ?? 'Delete File(s)'"
        size="sm"
        :dismissible="!deleting"
    >
        <template #body>
            <div class="w-full">
                Are you sure you want to delete {{props.fileIndexIds.length}} file(s)?
            </div>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" label="Cancel" @click="() => emit('close', false)" :disabled="deleting"/>
                <UButton size="sm" color="error" label="Delete" @click="onDelete" :disabled="deleting"/>
            </div>
        </template>
    </UModal>
</template>

<style scoped>

</style>