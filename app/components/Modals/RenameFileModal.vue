<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import {isValidFilename} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
const props = defineProps<{
    modalTitle?: string,
    fileIndexId: string,
    currentFileName: string,
}>()
const emit = defineEmits<{ close: [boolean] }>()

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    getSession
} = useActiveSessions()
const $wt = useActiveWorkspaceTools(getSession($sessionId))
const $qt = useQuickToasts()

const renaming = ref(false)

const state = reactive({
    filename: props.currentFileName,
})

const validate = (state: any): FormError[] => {
    const errors = []
    if (!state.filename) errors.push({ name: 'filename', message: 'Required' })
    if (!isValidFilename(state.filename)) errors.push({ name: 'filename', message: 'Invalid File Name' })
    return errors
}

async function onSubmit(event: FormSubmitEvent<typeof state>) {
    renaming.value = true
    await $wt.renameFile(props.fileIndexId, `${event.data.filename}`)
    $qt.success(`Created file ${event.data.filename}.`)
    renaming.value = false
    emit('close', false)
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="props?.modalTitle ?? 'Rename File'"
        size="sm"
        :dismissible="!renaming"
    >
        <template #body>
            <UForm :validate :state class="p-2 w-full" @submit="onSubmit" :disabled="renaming">
                <UFormField label="File Name" name="filename" required>
                    <UInput v-model="state.filename" class="w-full" autofocus/>
                </UFormField>
            </UForm>
        </template>
    </UModal>
</template>

<style scoped>

</style>