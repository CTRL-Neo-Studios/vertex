// ponytail: fixed character cap on the diff, its start kept; summarise per file if long commits need it.
const COMMIT_DIFF_CHARS = 16_000

/** What a commit message is written from. */
export interface CommitContext {
    /** Every file the commit takes, with git's status letter (`M notes/a.md`, `? new.md`). */
    files: string[],
    /** The patch of what it takes; new files are only listed. */
    diff: string,
    /** Recent commit subjects, newest first: the repository's style. */
    subjects: string[],
}

export const COMMIT_INSTRUCTIONS = 'You write git commit messages. Reply with only the message: a subject line of at most 72 characters saying what the change does, then, only if it needs explaining, a blank line and a short body. Follow the style and language of the recent subjects when there are any. No quotes, no code fences.'

/** The commit-message prompt: recent subjects, the files, and the diff cut at {@link COMMIT_DIFF_CHARS} (saying so). */
export function commitPrompt({files, diff, subjects}: CommitContext): string {
    const cut = diff.length > COMMIT_DIFF_CHARS
    return [
        subjects.length ? `Recent commit subjects:\n${subjects.map(s => `- ${s}`).join('\n')}` : '',
        `Files in this commit:\n${files.join('\n')}`,
        diff ? `Diff${cut ? ` (its first ${COMMIT_DIFF_CHARS} of ${diff.length} characters)` : ''}:\n${diff.slice(0, COMMIT_DIFF_CHARS)}` : '',
    ].filter(Boolean).join('\n\n')
}

/** A model's commit message without reasoning, a code fence or wrapping quotes. */
export function cleanCommitMessage(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        .replace(/^```[^\n]*\n/, '').replace(/\n?```$/, '').trim()
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
}
