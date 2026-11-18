/**
 * Builds the SDK into `dist/` from the kernel's sources (Plugin Architecture Plan, C1): the types of the contract and
 * the core plugins' APIs, the shared modules' export names, the host's Tailwind theme, and the Vite preset. Reads what
 * `nuxt prepare` generates (the app's tsconfig, Nuxt UI's theme). `bun run build` in this folder.
 */
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {compile} from '@tailwindcss/node'
import ts from 'typescript'
import {build} from 'vite'
import {SDK_MODULES} from '../../../shared/plugin/modules'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const repo = join(pkg, '../..')
const dist = join(pkg, 'dist')
const at = (path: string) => join(repo, path)

function write(path: string, text: string) {
    mkdirSync(dirname(path), {recursive: true})
    writeFileSync(path, text)
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function check(diagnostics: readonly ts.Diagnostic[]) {
    if (diagnostics.length) fail(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: f => f, getCurrentDirectory: () => repo, getNewLine: () => '\n',
    }))
}

const isValue = (checker: ts.TypeChecker, symbol: ts.Symbol) =>
    !!((symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol).flags & ts.SymbolFlags.Value)

rmSync(dist, {recursive: true, force: true})

// What the host shares, read from its registry with the app's own config (auto-imports, `~`, `.vue`): each module's
// value exports, and the types of `/ui`'s functions.
const nuxt = ts.getParsedCommandLineOfConfigFile(at('.nuxt/tsconfig.app.json'), {}, {
    ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => check([d]),
})!
const registry = at('app/utils/plugins/community.ts')
const host = ts.createProgram([...nuxt.fileNames.filter(f => f.endsWith('.d.ts')), registry], nuxt.options)
const checker = host.getTypeChecker()
const modules: Record<string, ts.Symbol> = {}
ts.forEachChild(host.getSourceFile(registry)!, function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isIdentifier(node.initializer)) {
        modules[node.name.text] = checker.getAliasedSymbol(checker.getSymbolAtLocation(node.initializer)!)
    }
    ts.forEachChild(node, visit)
})
const names = Object.fromEntries(Object.entries(modules).map(([id, module]) =>
    [id, checker.getExportsOfModule(module).filter(s => isValue(checker, s)).map(s => s.name).sort()]))
// What Vue's compiler writes imports of without its types declaring them (`mergeModels` for `defineModel` beside
// `defineProps`, `mergeDefaults`…): the runtime's own names too, which the host's copy has.
names.vue = [...new Set([...names.vue!, ...Object.keys(await import('vue')).filter(k => /^[A-Za-z_$][\w$]*$/.test(k))])].sort()
write(join(dist, 'modules.json'), `${JSON.stringify(names, null, 2)}\n`)

// `/ui`: each component typed by its props and events in the contract (`shared/plugin/components.ts`: `<Name>Props`,
// and `<Name>Emits` for one that emits), so `vue-tsc` checks a plugin's template; a component without its props there
// fails the build. One whose props are generic (`SettingsListProps<T>`) is declared as a generic function, as `vue-tsc`
// declares a generic component, so `T` is inferred from what the plugin passes. Its functions keep their signatures,
// with the Vue types they name imported. Checked with the contract below, where a name nothing declares fails the build.
const source = readFileSync(at('shared/plugin/components.ts'), 'utf8')
/** Each interface of the contract, with its type parameters as declared (`<T extends …>`) and as arguments (`<T>`). */
const componentTypes = new Map<string, { params: string, args: string }>()
ts.forEachChild(ts.createSourceFile('components.ts', source, ts.ScriptTarget.Latest), node => {
    if (!ts.isInterfaceDeclaration(node)) return
    const params = node.typeParameters
    componentTypes.set(node.name.text, params?.length
        ? {params: `<${params.map(p => source.slice(p.pos, p.end).trim()).join(', ')}>`, args: `<${params.map(p => p.name.text).join(', ')}>`}
        : {params: '', args: ''})
})
const vueTypes = new Set(checker.getExportsOfModule(modules.vue!).map(s => s.name))
const uiLines: string[] = []
const uiVue = new Set<string>()
const uiContract = new Set<string>()
for (const symbol of checker.getExportsOfModule(modules['@type32/vertex-plugin/ui']!)) {
    const from = symbol.declarations?.[0]?.parent.parent
    if (from && ts.isExportDeclaration(from) && from.moduleSpecifier && ts.isStringLiteral(from.moduleSpecifier) && from.moduleSpecifier.text.endsWith('.vue')) {
        const [props, emits] = [`${symbol.name}Props`, `${symbol.name}Emits`]
        if (!componentTypes.has(props)) fail(`/ui: ${symbol.name} has no ${props} in shared/plugin/components.ts`)
        uiContract.add(props)
        if (componentTypes.has(emits)) {
            uiContract.add(emits)
            uiVue.add('EmitsToProps')
        }
        const props$ = `${props}${componentTypes.get(props)!.args}${componentTypes.has(emits) ? ` & EmitsToProps<${emits}>` : ''}`
        const generic = componentTypes.get(props)!.params
        uiLines.push(generic
            ? `export declare const ${symbol.name}: ${generic}(props: ${props$}) => any`
            : `export declare const ${symbol.name}: new () => { $props: ${props$} }`)
        continue
    }
    const type = checker.typeToString(checker.getTypeOfSymbol(checker.getAliasedSymbol(symbol)), undefined, ts.TypeFormatFlags.NoTruncation).replaceAll('globalThis.', '')
    for (const word of type.match(/\b[A-Z]\w*/g) ?? []) if (vueTypes.has(word)) uiVue.add(word)
    uiLines.push(`export declare const ${symbol.name}: ${type}`)
}
const uiSource = join(dist, 'ui.ts')
write(uiSource, [
    `import type {${[...uiVue].sort().join(', ')}} from 'vue'`,
    `import type {${[...uiContract].sort().join(', ')}} from '#shared/plugin/components'`,
    '',
    ...uiLines,
    '',
].join('\n'))

// The contract's types, the core plugins' APIs (their `declare module` augments `PluginApis`), `/ui` and the preset.
// Their closure compiles on its own: only the contract and packages, nothing of the app's.
const apis = readdirSync(at('layers')).sort().map(id => `layers/${id}/app/api.ts`).filter(f => existsSync(at(f)))
const sdkSources = Object.values(SDK_MODULES).filter(f => f.startsWith('shared/'))
const typesDir = join(dist, 'types')
const contract = ts.createProgram([...sdkSources, ...apis, 'packages/vertex-plugin/src/vite.ts'].map(at).concat(uiSource), {
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    types: ['node'],
    declaration: true,
    emitDeclarationOnly: true,
    rootDir: repo,
    outDir: typesDir,
    paths: {'#shared/*': [at('shared/*')]},
})
check(ts.getPreEmitDiagnostics(contract))
check(contract.emit(undefined, (file, text) => write(file.endsWith('/dist/ui.d.ts') ? join(typesDir, 'ui.d.ts') : file, text)).diagnostics)
rmSync(uiSource)
// The `.d.ts` files they reach are sources, not emitted: copied as they are.
for (const {fileName} of contract.getSourceFiles()) {
    if (!fileName.startsWith(repo) || fileName.includes('/node_modules/') || !fileName.endsWith('.d.ts')) continue
    mkdirSync(dirname(join(typesDir, relative(repo, fileName))), {recursive: true})
    copyFileSync(fileName, join(typesDir, relative(repo, fileName)))
}

// Nuxt UI's components, by the names the app registers them under for plugins (`modules/nuxt-ui-components.ts`), as
// global components of a plugin's templates; typed with Nuxt UI's own declarations through its public paths.
const nuxtUiFiles = JSON.parse(readFileSync(at('.nuxt/nuxt-ui-components.json'), 'utf8')) as Record<string, string>
const nuxtUiRoot = at('node_modules/@nuxt/ui/')
const nuxtUiExports = Object.entries(JSON.parse(readFileSync(join(nuxtUiRoot, 'package.json'), 'utf8')).exports as Record<string, unknown>)
/** The file's public specifier: of the `exports` patterns that reach it, the most specific (`./components/*`, not `./runtime/*`). */
function nuxtUiPath(file: string): string {
    const inner = `./${relative(nuxtUiRoot, file)}`
    let best: { before: string, path: string } | undefined
    for (const [key, target] of nuxtUiExports) {
        if (typeof target !== 'string' || !key.includes('*')) continue
        const [before, after] = target.split('*') as [string, string]
        if (!inner.startsWith(before) || !inner.endsWith(after) || before.length <= (best?.before.length ?? -1)) continue
        best = {before, path: `@nuxt/ui${key.slice(1).replace('*', inner.slice(before.length, inner.length - after.length))}`}
    }
    return best?.path ?? fail(`${file}: @nuxt/ui's exports don't reach it`)
}
write(join(typesDir, 'nuxt-ui.d.ts'), [
    'export {}',
    "declare module 'vue' {",
    '    interface GlobalComponents {',
    ...Object.entries(nuxtUiFiles).map(([name, file]) => `        ${name}: typeof import('${nuxtUiPath(file)}')['default']`),
    '    }',
    '}',
    '',
].join('\n'))

// The preset turns an import of a component's file (a component library's) into the host's component of that name.
write(join(dist, 'nuxt-ui-components.json'), `${JSON.stringify(Object.fromEntries(Object.entries(nuxtUiFiles)
    .map(([name, file]) => [nuxtUiPath(file), name])), null, 2)}\n`)

write(join(typesDir, 'index.d.ts'), [
    "export * from './shared/plugin/api'",
    "import './nuxt-ui'",
    ...apis.map(f => `import './${f.replace(/\.ts$/, '')}'`),
    '',
].join('\n'))

/** The top-level statements and blocks of CSS without comments: each one's prelude (up to its `{` or `;`) and a block's body. */
function topLevel(css: string): { prelude: string, body?: string }[] {
    const out: { prelude: string, body?: string }[] = []
    let [depth, start, open, quote] = [0, 0, 0, '']
    for (let i = 0; i < css.length; i++) {
        const c = css[i]!
        if (quote) {
            if (c === '\\') i++
            else if (c === quote) quote = ''
        } else if (c === '"' || c === "'") quote = c
        else if (c === '{') {
            if (depth === 0) open = i
            depth++
        } else if (c === '}') {
            depth--
            if (depth === 0) {
                out.push({prelude: css.slice(start, open).trim(), body: css.slice(open + 1, i)})
                start = i + 1
            }
        } else if (c === ';' && depth === 0) {
            out.push({prelude: css.slice(start, i).trim()})
            start = i + 1
        }
    }
    return out
}

// The host's design system for `tailwind.css` to reference: its themes, utilities and variants, and nothing else. Its
// rules aren't a plugin's to write again, and one that `@apply`s wouldn't compile: a plugin's classes carry a prefix
// (`tw:flex`), so that its stylesheet, loaded beside the app's, sets nothing on the app's elements. Two parts:
// - the libraries' (Tailwind's, Nuxt UI's with the app's generated colors), read `inline`: their values are written
//   into a plugin's classes;
// - the app's own (`main.css`): each `@theme static` variable as itself (`--font-sans: var(--font-sans)`), since the
//   app always defines them and changes them while it runs.
const read = (path: string) => readFileSync(at(path), 'utf8')
const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@source[^;]*;/g, '')
const DESIGN = /^@(import|theme|utility|custom-variant)\b/
const designSystem = (css: string, theme = (prelude: string, body: string) => `${prelude} {${body}}`) => topLevel(clean(css))
    .filter(node => DESIGN.test(node.prelude))
    .map(({prelude, body}) => (body === undefined ? `${prelude};` : prelude.startsWith('@theme') ? theme(prelude, body) : `${prelude} {${body}}`))
    .join('\n\n') + '\n'
const libraries = designSystem([
    '@import "tailwindcss/theme.css" layer(theme);',
    read('node_modules/@nuxt/ui/dist/runtime/index.css')
        .replace('@import "#build/ui.css";', read('.nuxt/ui.css'))
        .replace('@import "./keyframes.css";', read('node_modules/@nuxt/ui/dist/runtime/keyframes.css')),
].join('\n'))
const app = designSystem(read('app/assets/css/main.css').replace(/@import\s+['"](tailwindcss|@nuxt\/ui)['"][^;]*;/g, ''), (_, body) => {
    const names = topLevel(body).map(node => (node.body === undefined ? /^(--[\w-]+)\s*:/.exec(node.prelude)?.[1] : undefined) ?? fail(`theme: main.css's @theme has more than variables: ${node.prelude}`))
    return `@theme inline {\n${names.map(name => `    ${name}: var(${name});`).join('\n')}\n}`
})
const imports = [...libraries.match(/@import[^;]*;/g) ?? [], ...app.match(/@import[^;]*;/g) ?? []]
if (imports.length !== 1) fail(`theme: the host's CSS imports what this build doesn't inline: ${imports.slice(1).join(' ')}`)
write(join(dist, 'theme-libraries.css'), libraries)
write(join(dist, 'theme-app.css'), app)
copyFileSync(join(pkg, 'src/tailwind.css'), join(dist, 'tailwind.css'))

// What ships compiles, and as promised: only prefixed classes, Nuxt UI's colours and the app's theme as variables,
// the app's own utilities.
const sheet = (await compile(readFileSync(join(dist, 'tailwind.css'), 'utf8'), {base: dist, onDependency() {}}))
    .build(['tw:flex', 'flex', 'tw:text-muted', 'tw:font-sans', 'tw:no-scrollbar'])
for (const [what, ok] of Object.entries({
    'a prefixed class': sheet.includes('.tw\\:flex'),
    'no unprefixed class': !/\.flex\b/.test(sheet),
    "Nuxt UI's colours": sheet.includes('var(--ui-text-muted)'),
    "the app's theme as variables": sheet.includes('font-family: var(--font-sans)'),
    "the app's utilities": sheet.includes('.tw\\:no-scrollbar'),
})) if (!ok) fail(`tailwind.css: it doesn't give a plugin ${what}`)

// The preset, with the kernel's manifest check bundled in.
await build({
    configFile: false,
    logLevel: 'warn',
    build: {ssr: join(pkg, 'src/vite.ts'), outDir: dist, emptyOutDir: false, rolldownOptions: {output: {entryFileNames: 'vite.js'}}},
})
