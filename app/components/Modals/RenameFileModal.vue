<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import {isValidFilename} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import useQuickToasts from "~/composables/utility/useQuickToasts";

const { t } = useI18n()

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

const validate = (state: { filename: string }): FormError[] => {
    const errors = []
    if (!state.filename) errors.push({ name: 'filename', message: t('app.generic.required') })
    if (!isValidFilename(state.filename)) errors.push({ name: 'filename', message: t('app.generic.ui.invalidFileName') })
    return errors
}

async function onSubmit(event: FormSubmitEvent<typeof state>) {
    renaming.value = true
    try {
        // The link-update prompt (if any) opens after this modal closes.
        emit('close', false)
        await $wt.renameFile(props.fileIndexId, `${event.data.filename}`)
        $qt.success(t('app.generic.ui.renamedFile', { filename: event.data.filename }))
    } catch (error) {
        $qt.error(t('app.generic.ui.renameFailed'), String(error))
    } finally {
        renaming.value = false
    }
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="props?.modalTitle ?? $t('app.generic.ui.renameFile')"
        size="sm"
        :dismissible="!renaming"
    >
        <template #body>
            <UForm :validate :state class="p-2 w-full" @submit="onSubmit" :disabled="renaming">
                <UFormField :label="$t('app.generic.fileName')" name="filename" required>
                    <UInput v-model="state.filename" class="w-full" autofocus/>
                </UFormField>
            </UForm>
        </template>
    </UModal>
</template>

<style scoped>

</style>