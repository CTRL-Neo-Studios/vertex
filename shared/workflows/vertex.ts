import {defineLanguage, t, tvar, type Language} from '@type32/workflows/core'
import {std} from '@type32/workflows/core/std'
import {toYamlValue} from './vault'

/** What List folder keeps. */
export interface ListOptions {
    /** Everything under the folder, not only its children. */
    recursive: boolean
    files: boolean
    folders: boolean
    /** Comma-separated extensions (`md, png`), any case, with or without the dot; `''` = any. */
    extensions: string
    /** Only notes with this tag, nested tags included; `''` = any. */
    tag: string
    /** A name or glob (`matchesPattern`) for the path inside the folder; `''` = any. */
    pattern: string
}

export interface FileInfo {
    /** With the extension. */
    name: string
    extension: string
    folder: string
    size: number
    /** ISO 8601. */
    created: string
    modified: string
}

export interface PickOptions {
    kind: 'file' | 'folder'
    multiple: boolean
    /** Like `ListOptions.extensions`. */
    extensions: string
}

/**
 * What Vertex nodes may do outside the program (§7). Every path is relative to the vault root and uses `/`;
 * the handlers confine them to the vault and check that an entry is the right kind (file, note, folder).
 */
export interface VertexEffects {
    index: {
        /** Markdown notes tagged `tag` (with or without `#`, case-insensitive, nested tags included), by path. */
        tagged(tag: string): Promise<string[]>
        /** A frontmatter property; `null` when absent. */
        property(path: string, key: string): Promise<unknown>
        /** Entries in a folder (`''` = vault root), by path. */
        list(folder: string, options: ListOptions): Promise<string[]>
        /** Entries anywhere whose name or path matches (`matchesPattern`), by path. */
        find(pattern: string): Promise<string[]>
        read(path: string): Promise<string>
        /** The files a file's links resolve to. */
        linksFrom(path: string): Promise<string[]>
        /** The files linking to an entry. */
        linksTo(path: string): Promise<string[]>
        info(path: string): Promise<FileInfo>
    }
    fs: {
        /** Renames in place (keeping the extension when `newName` has none) and rewrites links to it. Returns the new path. */
        rename(path: string, newName: string): Promise<string>
        /** Moves into `folder` (`''` = vault root) and rewrites links to it. Returns the new path. */
        move(path: string, folder: string): Promise<string>
        /** Moves to `.vertex/trash/<run>/`. Never deletes. */
        trash(path: string): Promise<void>
        setProperty(path: string, key: string, value: unknown): Promise<void>
        write(path: string, text: string): Promise<void>
        /** Adds `text` on a new line, unless the file is empty or already ends with one. */
        append(path: string, text: string): Promise<void>
        /** `name` gets `.md` unless it has it; `template` is a note whose text the new one starts with. Returns the path. */
        createNote(folder: string, name: string, template?: string): Promise<string>
        createFolder(folder: string, name: string): Promise<string>
        /** Copies a file, or a folder with everything in it, into `folder`, keeping its name. Returns the new path. */
        copy(path: string, folder: string): Promise<string>
        /** Adds or removes one frontmatter tag. */
        tag(path: string, tag: string, add: boolean): Promise<void>
    }
    /** Talks to the user. The prompts reject when they cancel. */
    ui: {
        askText(question: string, initial: string): Promise<string>
        askNumber(question: string, initial: number): Promise<number>
        askChoice(question: string, choices: string[]): Promise<string>
        askYesNo(question: string): Promise<boolean>
        /** One text answer per field, by field. */
        form(title: string, fields: string[]): Promise<Record<string, string>>
        /** Paths, at least one. */
        pick(prompt: string, options: PickOptions): Promise<string[]>
        message(text: string): Promise<void>
        /** The note the workflow was run on; otherwise asks for one. */
        currentNote(): Promise<string>
        open(path: string): Promise<void>
        /** Asked once per real run, before its first trash; dry runs don't ask. */
        confirmTrash(): Promise<boolean>
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
const num = t('number')
const bool = t('boolean')
const Entry = t('vertex.Entry')
const File = t('vertex.File')
const Note = t('vertex.Note')
const Folder = t('vertex.Folder')
const T = tvar('T')
const entryParam = [{name: 'T', bound: Entry}]
/** A folder input that defaults to the vault root. */
const inFolder = {type: Folder, default: ''}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const cancelled = (answer: unknown) => {
    if (answer === undefined) throw new Error('Cancelled')
}

export const vertexLanguage: Language<VertexEffects> = defineLanguage<VertexEffects, VertexValues>({
    id: 'vertex',
    version: 1,
    include: [std],
})
    // Paths; a literal one is picked in the editor and checked when its node runs (Appendix A #68).
    .type({id: 'vertex.Entry', label: 'Entry', color: 'teal', schema: {type: 'string'}})
    .type({id: 'vertex.File', label: 'File', extends: Entry, color: 'sky', schema: {type: 'string'}})
    .type({id: 'vertex.Note', label: 'Note', extends: File, color: 'violet', schema: {type: 'string'}})
    .type({id: 'vertex.Folder', label: 'Folder', extends: Entry, color: 'amber', schema: {type: 'string'}})
    .capability({id: 'index', mutates: false, label: 'Read the vault', description: 'Find notes and files, and read their text, properties and links.'})
    .capability({id: 'fs', mutates: true, label: 'Change files', description: 'Create, rename, move, copy, trash and edit notes. Every change can be undone.'})
    .capability({id: 'ui', mutates: false, label: 'Ask you', description: 'Show prompts, pickers and messages, and open notes.'})
    // Scratch's order and colors: Events first; Variables and My Blocks come between std's and these (order 1).
    .category({id: 'vertex.events', label: 'Events', color: 'yellow', icon: 'i-lucide-zap', order: -1})
    .category({id: 'vertex.notes', label: 'Notes', color: 'violet', icon: 'i-lucide-notebook-pen', order: 1})
    .category({id: 'vertex.files', label: 'Files & Folders', color: 'blue', icon: 'i-lucide-folder', order: 1})
    .category({id: 'vertex.properties', label: 'Properties', color: 'indigo', icon: 'i-lucide-list', order: 1})
    .category({id: 'vertex.tags', label: 'Tags & Links', color: 'teal', icon: 'i-lucide-tags', order: 1})
    .category({id: 'vertex.ask', label: 'Ask', color: 'cyan', icon: 'i-lucide-message-circle-question', order: 1})
    .node({
        type: 'vertex.onManual',
        version: 1,
        mode: 'event',
        label: 'On Run',
        category: 'vertex.events',
        icon: 'i-lucide-play-circle',
        description: 'Starts when you press Run.',
        exec: {out: ['then']},
    })
    // Notes
    .node({
        type: 'vertex.currentNote',
        version: 1,
        mode: 'once',
        label: 'Current note',
        category: 'vertex.notes',
        icon: 'i-lucide-file-check',
        description: 'The note the workflow was run on. Run from elsewhere, it asks which note.',
        outputs: {note: {type: Note}},
        requires: ['ui'],
        run: async ({effects}) => ({note: await effects.ui.currentNote()}),
    })
    .node({
        type: 'vertex.createNote',
        version: 1,
        mode: 'exec',
        label: 'Create note {name} in {folder}',
        category: 'vertex.notes',
        icon: 'i-lucide-file-plus',
        description: 'A new markdown note, starting with the template\'s text when there is one. Faults if the name is taken.',
        exec: {out: ['then']},
        inputs: {name: {type: str, required: true}, folder: inFolder, template: {type: Note}},
        outputs: {note: {type: Note}},
        requires: ['fs'],
        async run(ctx) {
            const {name, folder, template} = await ctx.inputs()
            ctx.output('note', await ctx.effects.fs.createNote(folder, name, template || undefined))
            return 'then'
        },
    })
    .node({
        type: 'vertex.readText',
        version: 1,
        mode: 'pure',
        label: 'Text of {file}',
        category: 'vertex.notes',
        icon: 'i-lucide-file-text',
        description: 'The whole file, frontmatter included.',
        inputs: {file: {type: File, required: true}},
        outputs: {text: {type: str}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({text: await effects.index.read(inputs.file)}),
    })
    .node({
        type: 'vertex.writeText',
        version: 1,
        mode: 'exec',
        label: 'Write {text} to {file}',
        category: 'vertex.notes',
        icon: 'i-lucide-file-pen-line',
        description: 'Replaces the whole file.',
        exec: {out: ['then']},
        inputs: {text: {type: str, default: ''}, file: {type: File, required: true}},
        requires: ['fs'],
        async run(ctx) {
            const {text, file} = await ctx.inputs()
            await ctx.effects.fs.write(file, text)
            return 'then'
        },
    })
    .node({
        type: 'vertex.appendText',
        version: 1,
        mode: 'exec',
        label: 'Append {text} to {file}',
        category: 'vertex.notes',
        icon: 'i-lucide-text-cursor-input',
        description: 'Adds the text at the end, on a new line.',
        exec: {out: ['then']},
        inputs: {text: {type: str, required: true}, file: {type: File, required: true}},
        requires: ['fs'],
        async run(ctx) {
            const {text, file} = await ctx.inputs()
            await ctx.effects.fs.append(file, text)
            return 'then'
        },
    })
    .node({
        type: 'vertex.asNote',
        version: 1,
        mode: 'exec',
        label: '{file} as a note',
        category: 'vertex.notes',
        icon: 'i-lucide-file-question',
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
    .node({
        type: 'vertex.open',
        version: 1,
        mode: 'exec',
        label: 'Open {file}',
        category: 'vertex.notes',
        icon: 'i-lucide-square-arrow-out-up-right',
        description: 'Opens the file in a tab. Dry runs don\'t.',
        exec: {out: ['then']},
        inputs: {file: {type: File, required: true}},
        requires: ['ui'],
        async run(ctx) {
            await ctx.effects.ui.open(await ctx.input('file'))
            return 'then'
        },
    })
    // Files & Folders
    .node({
        type: 'vertex.listFolder',
        version: 1,
        mode: 'pure',
        label: 'Entries in {folder}',
        category: 'vertex.files',
        icon: 'i-lucide-folder-tree',
        description: 'What a folder holds (empty: the vault root), by path. Extensions are comma-separated; pattern is a name or glob like *.md or Daily/**.',
        inputs: {
            folder: inFolder,
            recursive: {type: bool, default: false, wire: false, label: 'in subfolders'},
            files: {type: bool, default: true, wire: false},
            folders: {type: bool, default: false, wire: false},
            extensions: {type: str, default: ''},
            tag: {type: str, default: ''},
            pattern: {type: str, default: ''},
        },
        outputs: {entries: {type: t('List', Entry)}},
        requires: ['index'],
        run: async ({inputs: {folder, ...options}, effects}) => ({entries: await effects.index.list(folder, options)}),
    })
    .node({
        type: 'vertex.find',
        version: 1,
        mode: 'pure',
        label: 'Find {pattern}',
        category: 'vertex.files',
        icon: 'i-lucide-search',
        description: 'Entries anywhere in the vault by name (with or without extension) or glob: *.pdf matches names, Projects/**/*.md paths.',
        inputs: {pattern: {type: str, required: true}},
        outputs: {entries: {type: t('List', Entry)}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({entries: await effects.index.find(inputs.pattern)}),
    })
    .node({
        type: 'vertex.fileName',
        version: 1,
        mode: 'pure',
        label: 'Name of {file}',
        category: 'vertex.files',
        icon: 'i-lucide-text-cursor',
        description: 'The name without its folder or extension.',
        inputs: {file: {type: Entry, required: true}},
        outputs: {name: {type: str}},
        run: ({inputs}) => ({name: baseName(inputs.file).replace(/(.)\.[^.]*$/, '$1')}),
    })
    .node({
        type: 'vertex.fileInfo',
        version: 1,
        mode: 'pure',
        label: 'Info of {file}',
        category: 'vertex.files',
        icon: 'i-lucide-info',
        description: 'Name with extension, extension, folder, size in bytes, and when it was created and last modified (ISO dates).',
        inputs: {file: {type: Entry, required: true}},
        outputs: {
            name: {type: str},
            extension: {type: str},
            folder: {type: Folder},
            size: {type: num},
            created: {type: str},
            modified: {type: str},
        },
        requires: ['index'],
        run: async ({inputs, effects}) => ({...await effects.index.info(inputs.file)}),
    })
    .node({
        type: 'vertex.rename',
        version: 1,
        mode: 'exec',
        label: 'Rename {file} to {newName}',
        category: 'vertex.files',
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
        label: 'Move {file} to {folder}',
        category: 'vertex.files',
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
        type: 'vertex.copy',
        version: 1,
        mode: 'exec',
        label: 'Copy {file} to {folder}',
        category: 'vertex.files',
        icon: 'i-lucide-copy',
        description: 'Copies a file, or a folder with everything in it, keeping its name. Faults if the name is taken there.',
        typeParams: entryParam,
        exec: {out: ['then']},
        inputs: {file: {type: T, required: true}, folder: {type: Folder, required: true}},
        outputs: {copy: {type: T}},
        requires: ['fs'],
        async run(ctx) {
            const {file, folder} = await ctx.inputs()
            ctx.output('copy', await ctx.effects.fs.copy(file as string, folder))
            return 'then'
        },
    })
    .node({
        type: 'vertex.createFolder',
        version: 1,
        mode: 'exec',
        label: 'Create folder {name} in {folder}',
        category: 'vertex.files',
        icon: 'i-lucide-folder-plus',
        description: 'Faults if the name is taken.',
        exec: {out: ['then']},
        inputs: {name: {type: str, required: true}, folder: inFolder},
        outputs: {folder: {type: Folder}},
        requires: ['fs'],
        async run(ctx) {
            const {name, folder} = await ctx.inputs()
            ctx.output('folder', await ctx.effects.fs.createFolder(folder, name))
            return 'then'
        },
    })
    .node({
        type: 'vertex.trash',
        version: 1,
        mode: 'exec',
        label: 'Trash {file}',
        category: 'vertex.files',
        icon: 'i-lucide-trash-2',
        description: 'Moves to the vault\'s .vertex/trash folder, after asking once per run. Nothing is deleted.',
        exec: {out: ['then']},
        inputs: {file: {type: Entry, required: true}},
        requires: ['fs', 'ui'],
        async run(ctx) {
            const file = await ctx.input('file')
            if (!(await ctx.effects.ui.confirmTrash())) throw new Error('Trashing was declined')
            await ctx.effects.fs.trash(file)
            return 'then'
        },
    })
    // Properties
    .node({
        type: 'vertex.getProperty',
        version: 1,
        mode: 'pure',
        label: 'Property {key} of {file}',
        category: 'vertex.properties',
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
        label: 'Set {key} of {file} to {value}',
        category: 'vertex.properties',
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
    // Tags & Links
    .node({
        type: 'vertex.queryByTag',
        version: 1,
        mode: 'once',
        label: 'Notes tagged {tag}',
        category: 'vertex.tags',
        icon: 'i-lucide-tag',
        description: 'Every markdown note with this tag, nested tags included. Read once per run.',
        inputs: {tag: {type: str, wire: false, required: true}},
        outputs: {files: {type: t('List', Note)}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({files: await effects.index.tagged(inputs.tag)}),
    })
    .node({
        type: 'vertex.addTag',
        version: 1,
        mode: 'exec',
        label: 'Add tag {tag} to {note}',
        category: 'vertex.tags',
        icon: 'i-lucide-tag',
        description: 'Adds it to the frontmatter tags, unless the note has it already.',
        exec: {out: ['then']},
        inputs: {tag: {type: str, required: true}, note: {type: Note, required: true}},
        requires: ['fs'],
        async run(ctx) {
            const {tag, note} = await ctx.inputs()
            await ctx.effects.fs.tag(note, tag, true)
            return 'then'
        },
    })
    .node({
        type: 'vertex.removeTag',
        version: 1,
        mode: 'exec',
        label: 'Remove tag {tag} from {note}',
        category: 'vertex.tags',
        icon: 'i-lucide-tag',
        description: 'Removes exactly this tag from the frontmatter tags; nested tags under it stay.',
        exec: {out: ['then']},
        inputs: {tag: {type: str, required: true}, note: {type: Note, required: true}},
        requires: ['fs'],
        async run(ctx) {
            const {tag, note} = await ctx.inputs()
            await ctx.effects.fs.tag(note, tag, false)
            return 'then'
        },
    })
    .node({
        type: 'vertex.linksFrom',
        version: 1,
        mode: 'pure',
        label: 'Links from {file}',
        category: 'vertex.tags',
        icon: 'i-lucide-link',
        description: 'The files its links point to; links to missing files are left out.',
        inputs: {file: {type: File, required: true}},
        outputs: {files: {type: t('List', File)}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({files: await effects.index.linksFrom(inputs.file)}),
    })
    .node({
        type: 'vertex.linksTo',
        version: 1,
        mode: 'pure',
        label: 'Links to {file}',
        category: 'vertex.tags',
        icon: 'i-lucide-link-2',
        description: 'The files that link to it (its backlinks).',
        inputs: {file: {type: Entry, required: true}},
        outputs: {files: {type: t('List', File)}},
        requires: ['index'],
        run: async ({inputs, effects}) => ({files: await effects.index.linksTo(inputs.file)}),
    })
    // Ask: exec nodes, so a prompt comes at a set point in the run, once per activation.
    .node({
        type: 'vertex.askText',
        version: 1,
        mode: 'exec',
        label: 'Ask {question}',
        category: 'vertex.ask',
        icon: 'i-lucide-message-square-text',
        description: 'Waits for a text answer. Cancelling faults the node. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {question: {type: str, required: true}, initial: {type: str, default: ''}},
        outputs: {answer: {type: str}},
        requires: ['ui'],
        async run(ctx) {
            const {question, initial} = await ctx.inputs()
            ctx.output('answer', await ctx.effects.ui.askText(question, initial))
            return 'then'
        },
    })
    .node({
        type: 'vertex.askNumber',
        version: 1,
        mode: 'exec',
        label: 'Ask for a number: {question}',
        category: 'vertex.ask',
        icon: 'i-lucide-hash',
        description: 'Waits for a number. Cancelling faults the node. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {question: {type: str, required: true}, initial: {type: num, default: 0}},
        outputs: {answer: {type: num}},
        requires: ['ui'],
        async run(ctx) {
            const {question, initial} = await ctx.inputs()
            ctx.output('answer', await ctx.effects.ui.askNumber(question, initial))
            return 'then'
        },
    })
    .node({
        type: 'vertex.askChoice',
        version: 1,
        mode: 'exec',
        label: 'Ask {question} with choices {choices}',
        category: 'vertex.ask',
        icon: 'i-lucide-list-checks',
        description: 'Waits for one of the choices. Cancelling faults the node. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {question: {type: str, required: true}, choices: {type: t('List', str), required: true}},
        outputs: {answer: {type: str}},
        requires: ['ui'],
        async run(ctx) {
            const {question, choices} = await ctx.inputs()
            if (!choices.length) throw new Error('There are no choices')
            ctx.output('answer', await ctx.effects.ui.askChoice(question, [...choices]))
            return 'then'
        },
    })
    .node({
        type: 'vertex.askYesNo',
        version: 1,
        mode: 'exec',
        label: 'Ask yes or no: {question}',
        category: 'vertex.ask',
        icon: 'i-lucide-circle-help',
        description: 'Continues on yes or no. Cancelling faults the node. Dry runs ask too.',
        exec: {out: ['yes', 'no']},
        inputs: {question: {type: str, required: true}},
        requires: ['ui'],
        async run(ctx) {
            return (await ctx.effects.ui.askYesNo(await ctx.input('question'))) ? 'yes' : 'no'
        },
    })
    .node({
        type: 'vertex.form',
        version: 1,
        mode: 'exec',
        label: 'Form {title}',
        category: 'vertex.ask',
        icon: 'i-lucide-clipboard-list',
        description: 'Asks for a text answer per field at once; answers is a Dictionary from field to answer. Dry runs ask too.',
        exec: {out: ['then']},
        variadic: {kind: 'input', prefix: 'field', type: str, min: 1},
        inputs: {title: {type: str, required: true}},
        outputs: {answers: {type: t('Dictionary', str, str)}},
        requires: ['ui'],
        async run(ctx) {
            const inputs = await ctx.inputs() as Record<string, unknown>
            const fields = Array.from({length: ctx.variadic}, (_, i) => String(inputs[`field${i}`]))
            const answers = await ctx.effects.ui.form(String(inputs.title), fields)
            ctx.output('answers', new Map(fields.map(f => [f, answers[f] ?? ''])))
            return 'then'
        },
    })
    .node({
        type: 'vertex.pickFile',
        version: 1,
        mode: 'exec',
        label: 'Pick a file: {prompt}',
        category: 'vertex.ask',
        icon: 'i-lucide-file-search',
        description: 'Waits for a file from the vault, optionally only these comma-separated extensions. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {prompt: {type: str, default: ''}, extensions: {type: str, default: ''}},
        outputs: {file: {type: File}},
        requires: ['ui'],
        async run(ctx) {
            const {prompt, extensions} = await ctx.inputs()
            const [file] = await ctx.effects.ui.pick(prompt, {kind: 'file', multiple: false, extensions})
            cancelled(file)
            ctx.output('file', file!)
            return 'then'
        },
    })
    .node({
        type: 'vertex.pickFiles',
        version: 1,
        mode: 'exec',
        label: 'Pick files: {prompt}',
        category: 'vertex.ask',
        icon: 'i-lucide-files',
        description: 'Waits for one or more files from the vault, optionally only these comma-separated extensions. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {prompt: {type: str, default: ''}, extensions: {type: str, default: ''}},
        outputs: {files: {type: t('List', File)}},
        requires: ['ui'],
        async run(ctx) {
            const {prompt, extensions} = await ctx.inputs()
            ctx.output('files', await ctx.effects.ui.pick(prompt, {kind: 'file', multiple: true, extensions}))
            return 'then'
        },
    })
    .node({
        type: 'vertex.pickFolder',
        version: 1,
        mode: 'exec',
        label: 'Pick a folder: {prompt}',
        category: 'vertex.ask',
        icon: 'i-lucide-folder-search',
        description: 'Waits for a folder from the vault. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {prompt: {type: str, default: ''}},
        outputs: {folder: {type: Folder}},
        requires: ['ui'],
        async run(ctx) {
            const [folder] = await ctx.effects.ui.pick(await ctx.input('prompt'), {kind: 'folder', multiple: false, extensions: ''})
            cancelled(folder)
            ctx.output('folder', folder!)
            return 'then'
        },
    })
    .node({
        type: 'vertex.pickFolders',
        version: 1,
        mode: 'exec',
        label: 'Pick folders: {prompt}',
        category: 'vertex.ask',
        icon: 'i-lucide-folders',
        description: 'Waits for one or more folders from the vault. Cancelling faults the node. Dry runs ask too.',
        exec: {out: ['then']},
        inputs: {prompt: {type: str, default: ''}},
        outputs: {folders: {type: t('List', Folder)}},
        requires: ['ui'],
        async run(ctx) {
            const folders = await ctx.effects.ui.pick(await ctx.input('prompt'), {kind: 'folder', multiple: true, extensions: ''})
            cancelled(folders[0])
            ctx.output('folders', folders)
            return 'then'
        },
    })
    .node({
        type: 'vertex.showMessage',
        version: 1,
        mode: 'exec',
        label: 'Show {message}',
        category: 'vertex.ask',
        icon: 'i-lucide-message-square',
        description: 'Shows a message and continues at once. Other values than text are shown as JSON.',
        typeParams: [{name: 'T'}],
        exec: {out: ['then']},
        inputs: {message: {type: T, required: true}},
        requires: ['ui'],
        async run(ctx) {
            const message = await ctx.input('message')
            await ctx.effects.ui.message(typeof message === 'string' ? message : JSON.stringify(toYamlValue(message)))
            return 'then'
        },
    })
    .build()
