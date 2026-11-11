import type {GitFile, GitStatus} from "#shared/types/app/git";
import {resolveAiFeature} from "~/composables/ai/useAiConfig";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {isStaged} from "~/composables/git/useGitRepo";
import {generateCommitMessage} from "~/utils/chatTransport";
import {gitClient} from "~/utils/gitClient";

/**
 * AI commit messages (feature `commitMessage`, this window's effective settings): whether there's a model for them,
 * whether it writes one by itself for an empty box or auto-sync (`aiConfig.commitMessages`), and a message for what
 * the next commit takes, written from its diff and the repository's recent subjects.
 */
export function useCommitMessage(root: string | undefined) {
    const {effective} = useSettingsScope()
    const model = computed(() => {
        const ai = effective.value?.aiConfig
        return ai ? resolveAiFeature(ai, 'commitMessage') : null
    })
    const when = computed(() => effective.value?.aiConfig.commitMessages)

    /** `all`: the commit takes every change (nothing is staged, or Sync); else only what's staged. */
    async function generate(status: GitStatus, all: boolean): Promise<string> {
        const resolved = model.value
        if (!resolved || !root) return ''
        const files = status.files.filter(f => all || isStaged(f))
        const letter = (f: GitFile) => (f.conflicted ? 'U' : all && f.worktree !== '.' ? f.worktree : f.index)
        const [staged, unstaged, log] = await Promise.all([
            files.some(isStaged) ? gitClient.diff(root, true) : '',
            all ? gitClient.diff(root, false) : '',
            gitClient.log(root, 0, 10).catch(() => []),
        ])
        return generateCommitMessage(resolved.provider, resolved.profile.modelId, {
            files: files.map(f => `${letter(f)} ${f.path}`),
            diff: [staged, unstaged].filter(Boolean).join('\n'),
            subjects: log.map(c => c.subject),
        })
    }

    return {
        available: computed(() => !!model.value),
        /** Commit or Sync with an empty box asks the model. */
        whenEmpty: computed(() => !!model.value && !!when.value?.whenEmpty),
        /** Auto-sync's commits ask the model. */
        onAutoSync: computed(() => !!model.value && !!when.value?.autoSync),
        generate,
    }
}
