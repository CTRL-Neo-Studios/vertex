<script setup lang="ts">
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
        :title="props?.modalTitle ?? $t('app.generic.ui.deleteConfirm', {count: props.fileIndexIds.length})"
        size="sm"
        :dismissible="!deleting"
    >
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" :label="$t('app.generic.cancel')" @click="() => emit('close', false)" :disabled="deleting"/>
                <UButton size="sm" color="error" :label="$t('app.generic.delete')" @click="onDelete" :disabled="deleting"/>
            </div>
        </template>
    </UModal>
</template>

<style scoped>

</style>