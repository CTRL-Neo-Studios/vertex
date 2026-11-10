<script setup lang="ts">
/**
 * The Git view's commit box. Its own component so typing re-renders only the box, not the view's file lists; the
 * view reads and clears `message` through the exposed instance (Sync uses it too).
 */
const props = defineProps<{
    /** Nothing running and something to commit. */
    ready: boolean,
    /** Something is staged: Commit takes only that, else every change. */
    staged: boolean,
    /** Commits (and pushes, with `andPush`); true once committed, which clears the box. */
    commit: (message: string, andPush: boolean) => Promise<boolean>,
    /** Writes a message with AI (`''` when it couldn't); absent when the feature is off, which hides its button. */
    write?: () => Promise<string>,
}>()
const {t} = useI18n()

const message = ref('')
const canCommit = computed(() => props.ready && !!message.value.trim())
async function run(andPush: boolean) {
    if (canCommit.value && await props.commit(message.value.trim(), andPush)) message.value = ''
}

const writing = ref(false)
async function draft() {
    if (!props.write || writing.value) return
    writing.value = true
    try {
        const written = await props.write()
        if (written) message.value = written
    } finally {
        writing.value = false
    }
}
defineExpose({message})
</script>

<template>
    <div class="p-2 flex flex-col gap-1.5 pb-4">
        <UTextarea
            v-model="message"
            :placeholder="t('app.git.message')"
            :rows="2"
            :maxrows="8"
            autoresize
            size="sm"
            @keydown.meta.enter.prevent="run(false)"
            @keydown.ctrl.enter.prevent="run(false)"
        />
        <div class="flex gap-1.5">
            <UTooltip v-if="props.write" :text="t('app.git.ai.write')">
                <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-sparkles"
                    :loading="writing"
                    :disabled="!props.ready"
                    :aria-label="t('app.git.ai.write')"
                    data-git-ai-message
                    @click="draft"
                />
            </UTooltip>
            <UTooltip :text="props.staged ? t('app.git.commitHint') : t('app.git.commitAllHint')">
                <UButton class="flex-1" block size="sm" :label="t('app.git.commit')" :disabled="!canCommit" @click="run(false)"/>
            </UTooltip>
            <UTooltip :text="t('app.git.commitPushHint')">
                <UButton size="sm" color="neutral" variant="outline" :label="t('app.git.commitPush')" :disabled="!canCommit" @click="run(true)"/>
            </UTooltip>
        </div>
    </div>
</template>
