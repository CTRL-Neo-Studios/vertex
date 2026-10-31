<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import {isValidFilename} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import useQuickToasts from "~/composables/utility/useQuickToasts";

const { t } = useI18n()

const props = defineProps<{
    modalTitle?: string,
    atFileIndexId?: string,
    asFolder: boolean,
    asLevel: "above" | "same" | "below",
    fileExt?: string,
}>()
const emit = defineEmits<{ close: [boolean] }>()

const state = reactive({
    filename: '',
})

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    getSession
} = useActiveSessions()
const $wt = useActiveWorkspaceTools(getSession($sessionId))
const $qt = useQuickToasts()

const validate = (state: { filename: string }): FormError[] => {
    const errors = []
    if (!state.filename) errors.push({ name: 'filename', message: t('app.generic.required') })
    if (!isValidFilename(state.filename)) errors.push({ name: 'filename', message: t('app.generic.ui.invalidFileName') })
    return errors
}

async function onSubmit(event: FormSubmitEvent<typeof state>) {
    try {
        await $wt.createFile(props.atFileIndexId, `${event.data.filename}${props?.fileExt && !props?.asFolder ? '.' + props?.fileExt : ''}`, props.asFolder, props.asLevel)
        $qt.success(t('app.generic.ui.createdFile', { filename: event.data.filename }))
        emit('close', false)
    } catch (error) {
        $qt.error(t('app.home.createFailed'), String(error))
    }
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="props?.modalTitle ?? $t('app.editor.ui.filetree.newMarkdownFile')"
        size="sm"
    >
        <template #body>
            <UForm :validate :state class="p-2 w-full" @submit="onSubmit">
                <UFormField :label="$t('app.generic.fileName')" name="filename" required>
                    <UInput v-model="state.filename" class="w-full" autofocus/>
                </UFormField>
            </UForm>
        </template>
    </UModal>
</template>

<style scoped>

</style>