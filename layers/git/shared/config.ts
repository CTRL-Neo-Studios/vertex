/** `plugins.config.git` as the plugin reads it (`gitConfigOf`). */
export interface GitConfig {
    /** The git executable; `''` finds it (the git crate's `find_git`). Global only: a workspace mustn't choose which program runs as git. */
    path: string,
    /** Keeping workspaces in step without the Sync button (`useGitAutoSync`); everything off by default. */
    autoSync: {
        /** Commit, pull and push every this many minutes; 0 is off. */
        interval: number,
        /** Sync once when a workspace window opens. */
        onOpen: boolean,
        /** Pull when the window gets focus. */
        pullOnFocus: boolean,
    },
    /** When AI writes a commit message by itself (feature `commitMessage`). */
    commitMessages: {
        /** Auto-sync's commits: off by default, a timer sending diffs to a model is opt-in. */
        autoSync: boolean,
        /** Commit or Sync with an empty box. */
        whenEmpty: boolean,
    },
}

type Loose = Record<string, unknown>
const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The stored config checked and defaulted. */
export function gitConfigOf(data?: unknown): GitConfig {
    const git: Loose = isLoose(data) ? data : {}
    const auto: Loose = isLoose(git.autoSync) ? git.autoSync : {}
    const commits: Loose = isLoose(git.commitMessages) ? git.commitMessages : {}
    const interval = auto.interval
    return {
        path: typeof git.path === 'string' ? git.path : '',
        autoSync: {
            interval: typeof interval === 'number' && Number.isFinite(interval) && interval > 0 ? interval : 0,
            onOpen: auto.onOpen === true,
            pullOnFocus: auto.pullOnFocus === true,
        },
        commitMessages: {autoSync: commits.autoSync === true, whenEmpty: commits.whenEmpty !== false},
    }
}
