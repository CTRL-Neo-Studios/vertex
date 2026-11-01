import {defineLanguage, t, tvar, type Language} from '@type32/workflows/core'
import {std} from '@type32/workflows/core/std'

/**
 * What Vertex nodes may do outside the program (§7). Every path is relative to the vault root and uses `/`;
 * the handlers confine them to the vault.
 */
export interface VertexEffects {
    index: {
        /** Markdown notes tagged `tag` (with or without `#`, case-insensitive, nested tags included), by path. */
        tagged(tag: string): Promise<string[]>
        /** A frontmatter property; `null` when absent. */
        property(path: string, key: string): Promise<unknown>
    }
    fs: {
        /** Renames in place (keeping the extension when `newName` has none) and rewrites links to it. Returns the new path. */
        rename(path: string, newName: string): Promise<string>
        /** Moves into `folder` (`''` = vault root) and rewrites links to it. Returns the new path. */
        move(path: string, folder: string): Promise<string>
        /** Moves to `.vertex/trash/<run>/`. Never deletes. */
        trash(path: string): Promise<void>
        setProperty(path: string, key: string, value: unknown): Promise<void>
    }
}

/** A vault entry's value is its vault-relative path. */
interface VertexValues {
    'vertex.Entry': string
    'vertex.File': string
    'vertex.Note': string
    'vertex.Folder': string
}

const str = t('string')
const Entry = t('vertex.Entry')
const Note = t('vertex.Note')
const Folder = t('vertex.Folder')
const T = tvar('T')
const entryParam = [{name: 'T', bound: Entry}]

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const vertexLanguage: Language<VertexEffects> = defineLanguage<VertexEffects, VertexValues>({
    id: 'vertex',
    version: 1,
    include: [std],
})
    .type({id: 'vertex.Entry', label: 'Entry', color: 'teal'})
    .type({id: 'vertex.File', label: 'File', extends: Entry, color: 'sky'})
    .type({id: 'vertex.Note', label: 'Note', extends: t('vertex.File'), color: 'violet'})
    // Folders take a typed path, so Move can point at one; the handler checks it exists.
    .type({id: 'vertex.Folder', label: 'Folder', extends: Entry, color: 'amber', schema: {type: 'string'}})
    .capability({id: 'index', mutates: false, label: 'Read the vault index', description: 'Find notes and read their properties.'})
    .capability({id: 'fs', mutates: true, label: 'Change files', description: 'Rename, move, trash and edit notes. Every change can be undone.'})
    .node({
        type: 'vertex.onManual',
        version: 1,
        mode: 'event',
        label: 'On Run',
        category: 'Events',
        icon: 'i-lucide-play-circle',
        description: 'Starts when you press Run.',
        exec: {out: ['then']},
    })
    .node({
        type: 'vertex.queryByTag',
        version: 1,
        mode: 'once',
        label: 'Notes Tagged',
        category: 'Vault',
        icon: 'i-lucide-tag',
        description: 'Every markdown note with this tag, nested tags included. Read once per run.',
        inputs: {tag: {type: str, wire: false, required: true}},
        outputs: {files: {type: t('List', Note)}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({files: await effects.index.tagged(inputs.tag)}),
    })
    .node({
        type: 'vertex.fileName',
        version: 1,
        mode: 'pure',
        label: 'Name',
        category: 'Vault',
        icon: 'i-lucide-text-cursor',
        description: 'The name without its folder or extension.',
        inputs: {file: {type: Entry, required: true}},
        outputs: {name: {type: str}},
        run: ({inputs}) => ({name: baseName(inputs.file).replace(/(.)\.[^.]*$/, '$1')}),
    })
    .node({
        type: 'vertex.getProperty',
        version: 1,
        mode: 'pure',
        label: 'Get Property',
        category: 'Properties',
        icon: 'i-lucide-list',
        description: 'A frontmatter property, or null when the note has none.',
        inputs: {file: {type: Note, required: true}, key: {type: str, required: true}},
        outputs: {value: {type: t('any')}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({value: await effects.index.property(inputs.file, inputs.key)}),
    })
    .node({
        type: 'vertex.setProperty',
        version: 1,
        mode: 'exec',
        label: 'Set Property',
        category: 'Properties',
        icon: 'i-lucide-list-plus',
        description: 'Sets a frontmatter property, creating the frontmatter if needed.',
        typeParams: [{name: 'T'}],
        exec: {out: ['then']},
        inputs: {file: {type: Note, required: true}, key: {type: str, required: true}, value: {type: T, required: true}},
        requires: ['fs'],
        async run(ctx) {
            const {file, key, value} = await ctx.inputs()
            await ctx.effects.fs.setProperty(file, key, value)
            return 'then'
        },
    })
    .node({
        type: 'vertex.rename',
        version: 1,
        mode: 'exec',
        label: 'Rename',
        category: 'Files',
        icon: 'i-lucide-pencil-line',
        description: 'Renames in place and updates links to it. Without an extension in the new name, the old one stays.',
        typeParams: entryParam,
        exec: {out: ['then']},
        inputs: {file: {type: T, required: true}, newName: {type: str, required: true}},
        outputs: {file: {type: T}},
        requires: ['fs'],
        async run(ctx) {
            const {file, newName} = await ctx.inputs()
            ctx.output('file', await ctx.effects.fs.rename(file as string, newName))
            return 'then'
        },
    })
    .node({
        type: 'vertex.move',
        version: 1,
        mode: 'exec',
        label: 'Move',
        category: 'Files',
        icon: 'i-lucide-folder-input',
        description: 'Moves into a folder and updates links to it. An empty folder path is the vault root.',
        typeParams: entryParam,
        exec: {out: ['then']},
        inputs: {file: {type: T, required: true}, folder: {type: Folder, required: true}},
        outputs: {file: {type: T}},
        requires: ['fs'],
        async run(ctx) {
            const {file, folder} = await ctx.inputs()
            ctx.output('file', await ctx.effects.fs.move(file as string, folder))
            return 'then'
        },
    })
    .node({
        type: 'vertex.trash',
        version: 1,
        mode: 'exec',
        label: 'Trash',
        category: 'Files',
        icon: 'i-lucide-trash-2',
        description: 'Moves to the vault\'s .vertex/trash folder. Nothing is deleted.',
        exec: {out: ['then']},
        inputs: {file: {type: Entry, required: true}},
        requires: ['fs'],
        async run(ctx) {
            await ctx.effects.fs.trash(await ctx.input('file'))
            return 'then'
        },
    })
    .node({
        type: 'vertex.asNote',
        version: 1,
        mode: 'exec',
        label: 'As Note',
        category: 'Vault',
        icon: 'i-lucide-file-text',
        description: 'Continues on ok with the entry as a note when it is a markdown file, else on fail.',
        exec: {out: ['ok', 'fail']},
        inputs: {file: {type: Entry, required: true}},
        outputs: {note: {type: Note}},
        async run(ctx) {
            const file = await ctx.input('file')
            if (!/\.md$/i.test(file)) return 'fail'
            ctx.output('note', file)
            return 'ok'
        },
    })
    .build()
