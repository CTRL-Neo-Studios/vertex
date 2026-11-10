<script setup lang="ts">
import {readTextFile} from "@tauri-apps/plugin-fs";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {diffSideLabel, diffSpecOf} from "~/utils/gitDiff";
import {gitClient} from "~/utils/gitClient";
import TextDiff from "~/components/Diff/TextDiff.vue";

/**
 * A git diff tab: one file's two versions from git, drawn by `TextDiff`. The working tree and staged sides reload
 * whenever the workspace changes on disk (an edit, a commit, a checkout); a commit's never change.
 */
const props = defineProps<{ tabId: string }>()

const {t} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const index = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
const spec = diffSpecOf(props.tabId)

/** The two versions; `undefined` for a side the file isn't on (new, deleted). */
const sides = shallowRef<{ before?: string, after?: string }>()
const failed = ref(false)

async function load() {
    const root = session?.rootPath
    if (!spec || !root) return
    const show = (rev: string | null, path: string) => gitClient.showFile(root, rev, path).catch(() => undefined)
    const old = spec.origPath ?? spec.path
    const [before, after] = await Promise.all(
        spec.side === 'worktree' ? [show('HEAD', old), readTextFile(`${spec.top}/${spec.path}`).catch(() => undefined)]
            : spec.side === 'staged' ? [show('HEAD', old), show(null, spec.path)]
                : [show(`${spec.side}^`, old), show(spec.side, spec.path)],
    )
    failed.value = before === undefined && after === undefined
    sides.value = {before, after}
}
onMounted(load)
if (spec?.side === 'worktree' || spec?.side === 'staged') {
    const reload = useDebounceFn(load, 300)
    onBeforeUnmount(index.on(event => {
        if (event.type === 'changed') void reload()
    }))
}

const name = spec ? spec.path.slice(spec.path.lastIndexOf('/') + 1) : ''
const dir = spec ? spec.path.slice(0, Math.max(spec.path.lastIndexOf('/'), 0)) : ''
const sideLabel = spec ? diffSideLabel(spec, t) : ''
const against = spec && (spec.side === 'worktree' || spec.side === 'staged') ? t('app.git.diff.againstHead') : t('app.git.diff.againstParent')
const note = computed(() => {
    if (!sides.value || failed.value) return ''
    if (sides.value.before === undefined) return t('app.git.diff.added')
    if (sides.value.after === undefined) return t('app.git.diff.deleted')
    return spec?.origPath ? t('app.git.diff.renamed', {path: spec.origPath}) : ''
})
const node = computed(() => (spec ? index.getFileByPath(`${spec.top}/${spec.path}`) : undefined))

async function openFile() {
    if (node.value && session) await $navi.toWorkspaceTab(session.uuid, openTab(node.value.uuid))
}
</script>

<template>
    <TextDiff :sides :failed="!spec || failed">
        <template #header="{added, removed, binary}">
            <div class="shrink-0 flex items-center gap-2 px-4 h-10 border-b border-default text-sm">
                <UIcon name="i-lucide-git-compare" class="size-4 shrink-0 text-muted"/>
                <span class="font-medium truncate shrink-0 max-w-1/2">{{ name }}</span>
                <span class="text-xs text-dimmed truncate">{{ dir }}</span>
                <UTooltip :text="against">
                    <UBadge :label="sideLabel" size="sm" color="neutral" variant="soft" class="shrink-0"/>
                </UTooltip>
                <span v-if="note" class="text-xs text-muted truncate">{{ note }}</span>
                <div class="flex-1"/>
                <span v-if="!binary && !failed" class="shrink-0 flex items-center gap-2 text-xs tabular-nums">
                    <span class="text-success">+{{ added }}</span>
                    <span class="text-error">−{{ removed }}</span>
                </span>
                <UButton
                    v-if="node"
                    :label="t('app.git.openFile')"
                    icon="i-lucide-file-text"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="shrink-0"
                    @click="openFile"
                />
            </div>
        </template>
    </TextDiff>
</template>
