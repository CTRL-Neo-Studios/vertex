import type {InstallRecord} from '~/utils/plugins/catalog'

type T = (key: string, params?: Record<string, unknown>) => string

/** Where a plugin came from, in a line: `github.com/o/r · release v0.2.0`, `… · branch dist @ 1a2b3c4`, a file… */
export function describeOrigin(record: Pick<InstallRecord, 'kind' | 'origin' | 'name' | 'commit'>, t: T): string {
    const commit = record.commit?.slice(0, 7)
    switch (record.kind) {
        case 'release': return t('app.settings.plugins.origin.release', {origin: record.origin, name: record.name ?? ''})
        case 'branch': return t('app.settings.plugins.origin.branch', {origin: record.origin, name: record.name ?? '', commit: commit ?? ''})
        case 'tag': return t('app.settings.plugins.origin.tag', {origin: record.origin, name: record.name ?? ''})
        case 'commit': return t('app.settings.plugins.origin.commit', {origin: record.origin, commit: commit ?? ''})
        case 'zip': return t('app.settings.plugins.origin.zip', {origin: record.origin})
        case 'file': return t('app.settings.plugins.origin.file', {origin: record.origin})
        case 'folder': return t('app.settings.plugins.origin.folder', {origin: record.origin})
    }
}

/** The web page of a record's origin: a repository's, or the `.zip` URL; none for a file or a folder. */
export const originUrl = (record: Pick<InstallRecord, 'kind' | 'origin'>): string | undefined =>
    record.kind === 'file' || record.kind === 'folder' ? undefined : record.kind === 'zip' ? record.origin : `https://${record.origin}`

/** A source another device can install from (a Git repository or an `https` `.zip`), not a path on this one. */
export const shareableSource = (source: string | null | undefined): source is string => !!source && /^(git\+)?https:\/\//.test(source)
