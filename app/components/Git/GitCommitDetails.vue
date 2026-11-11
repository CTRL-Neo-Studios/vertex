<script setup lang="ts">
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {GitChange, GitCommit} from "#shared/types/app/git";
import {gitClient} from "~/utils/gitClient";
import {GIT_STATES} from "~/utils/gitStates";

/**
 * The History view's selected commit: message, author, id, parents and its files. Its own component, so scrolling the
 * commit list (which re-renders the list's rows) doesn't redraw a commit's thousands of files.
 */
const props = defineProps<{ root: string, commit: GitCommit, wide: boolean }>()
const emit = defineEmits<{ close: [], select: [id: string], open: [change: GitChange] }>()
const {t, locale} = useI18n()

const files = shallowRef<GitChange[]>()
watch(() => props.commit, async commit => {
    files.value = undefined
    const changes = await gitClient.commitFiles(props.root, commit.id).catch(() => [])
    if (props.commit === commit) files.value = changes
}, {immediate: true})

const fullDate = (time: number) => new Date(time * 1000).toLocaleString(locale.value)
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))
</script>

<template>
    <div
        :class="['shrink-0 flex flex-col min-h-0 overflow-y-auto border-default', wide ? 'w-88 border-s' : 'max-h-1/2 border-t']"
        data-git-commit
    >
        <div class="flex items-start gap-2 px-3 pt-2.5">
            <p class="flex-1 font-medium text-sm text-highlighted break-words">{{ commit.subject }}</p>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="t('app.git.history.close')" @click="emit('close')"/>
        </div>
        <p v-if="commit.body" class="px-3 pt-1 text-sm text-muted whitespace-pre-wrap break-words">{{ commit.body }}</p>
        <div class="px-3 pt-2 flex flex-col gap-1 text-xs text-muted">
            <span>{{ commit.author }} · {{ fullDate(commit.time) }}</span>
            <span class="flex items-center gap-1 flex-wrap">
                <UButton
                    :label="commit.id.slice(0, 7)"
                    icon="i-lucide-copy"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    class="font-mono"
                    :aria-label="t('app.git.history.copyId')"
                    @click="writeText(commit.id)"
                />
                <template v-if="commit.parents.length">
                    <span class="ps-1">{{ t('app.git.history.parents') }}</span>
                    <UButton
                        v-for="parent in commit.parents"
                        :key="parent"
                        :label="parent.slice(0, 7)"
                        color="neutral"
                        variant="link"
                        size="xs"
                        class="font-mono px-0.5"
                        @click="emit('select', parent)"
                    />
                </template>
            </span>
        </div>
        <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted">{{ t('app.git.history.files') }}</p>
        <div class="px-1.5 pb-2">
            <p v-if="files && !files.length" class="px-1.5 text-xs text-dimmed">{{ t('app.git.history.noFiles') }}</p>
            <button
                v-for="change in files"
                :key="change.path"
                type="button"
                :data-commit-file="change.path"
                class="w-full flex items-center gap-1.5 ps-1.5 pe-1 h-7 rounded-md text-sm text-start hover:bg-elevated/60"
                @click="emit('open', change)"
            >
                <span class="truncate shrink-0 max-w-[70%]">{{ nameOf(change.path) }}</span>
                <span class="truncate text-xs text-dimmed">{{ dirOf(change.path) }}</span>
                <UTooltip :text="t(`app.git.states.${GIT_STATES[change.status].key}`)">
                    <span :class="['ms-auto w-5 text-center font-mono text-xs', GIT_STATES[change.status].color]">{{ change.status }}</span>
                </UTooltip>
            </button>
        </div>
    </div>
</template>
