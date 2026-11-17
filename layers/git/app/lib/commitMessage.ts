import {generateText} from "ai";
import type {GitFile, GitStatus} from "../../shared/types";
import {COMMIT_INSTRUCTIONS, cleanCommitMessage, commitPrompt} from "../../shared/commitMessage";
import {gitConfigOf} from "../../shared/config";
import {gitContext} from "../plugin";
import {isStaged} from "./repo";
import {gitClient} from "./client";

/**
 * AI commit messages (feature `commitMessage`, through the AI plugin while it's on): whether there's a model for them,
 * whether it writes one by itself for an empty box or auto-sync (the git config's `commitMessages`), and a message for
 * what the next commit takes, written from its diff and the repository's recent subjects.
 */
export function useCommitMessage(root: string | undefined) {
    const model = computed(() => gitContext().use('ai')?.resolveFeature('commitMessage') ?? null)
    const when = computed(() => gitConfigOf(gitContext().config.value).commitMessages)

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
        const {text} = await generateText({
            model: resolved.languageModel({params: false}),
            instructions: COMMIT_INSTRUCTIONS,
            prompt: commitPrompt({
                files: files.map(f => `${letter(f)} ${f.path}`),
                diff: [staged, unstaged].filter(Boolean).join('\n'),
                subjects: log.map(c => c.subject),
            }),
        })
        return cleanCommitMessage(text)
    }

    return {
        available: computed(() => !!model.value),
        /** Commit or Sync with an empty box asks the model. */
        whenEmpty: computed(() => !!model.value && when.value.whenEmpty),
        /** Auto-sync's commits ask the model. */
        onAutoSync: computed(() => !!model.value && when.value.autoSync),
        generate,
    }
}
