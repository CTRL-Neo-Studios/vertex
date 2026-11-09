import type {GitState} from "#shared/types/app/git";

/** Each status letter's name (`app.git.states.*`) and color, wherever a file's state shows. */
export const GIT_STATES: Record<GitState, { key: string, color: string }> = {
    '.': {key: 'unchanged', color: 'text-muted'},
    'M': {key: 'modified', color: 'text-warning'},
    'A': {key: 'added', color: 'text-success'},
    'D': {key: 'deleted', color: 'text-error'},
    'R': {key: 'renamed', color: 'text-info'},
    'C': {key: 'copied', color: 'text-success'},
    'T': {key: 'typeChanged', color: 'text-warning'},
    'U': {key: 'conflicted', color: 'text-error'},
    '?': {key: 'untracked', color: 'text-success'},
}
