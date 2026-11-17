/**
 * Builds the SDK into `dist/` from the kernel's sources (Plugin Architecture Plan, C1): the types of the contract and
 * the core plugins' APIs, the shared modules' export names, the host's Tailwind theme, and the Vite preset. Reads what
 * `nuxt prepare` generates (the app's tsconfig, Nuxt UI's theme). `bun run build` in this folder.
 */
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
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
write(join(dist, 'modules.json'), `${JSON.stringify(names, null, 2)}\n`)

// `/ui`: its components are Vue's `Component` (the unstable tier); its functions keep their signatures, with the Vue
// types they name imported. Checked with the contract below, where a name nothing declares fails the build.
const vueTypes = new Set(checker.getExportsOfModule(modules.vue!).map(s => s.name))
const uiLines: string[] = []
const uiVue = new Set(['Component'])
for (const symbol of checker.getExportsOfModule(modules['@type32/vertex-plugin/ui']!)) {
    const from = symbol.declarations?.[0]?.parent.parent
    if (from && ts.isExportDeclaration(from) && from.moduleSpecifier && ts.isStringLiteral(from.moduleSpecifier) && from.moduleSpecifier.text.endsWith('.vue')) {
        uiLines.push(`export declare const ${symbol.name}: Component`)
        continue
    }
    const type = checker.typeToString(checker.getTypeOfSymbol(checker.getAliasedSymbol(symbol)), undefined, ts.TypeFormatFlags.NoTruncation).replaceAll('globalThis.', '')
    for (const word of type.match(/\b[A-Z]\w*/g) ?? []) if (vueTypes.has(word)) uiVue.add(word)
    uiLines.push(`export declare const ${symbol.name}: ${type}`)
}
const uiSource = join(dist, 'ui.ts')
write(uiSource, [`import type {${[...uiVue].sort().join(', ')}} from 'vue'`, '', ...uiLines, ''].join('\n'))

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

write(join(typesDir, 'index.d.ts'), [
    "export * from './shared/plugin/api'",
    "import './nuxt-ui'",
    ...apis.map(f => `import './${f.replace(/\.ts$/, '')}'`),
    '',
].join('\n'))

// The host's theme for `tailwind.css` to reference, without comments and `@source`s: the libraries' (Tailwind's, Nuxt
// UI's with the app's generated colors), whose values plugins write into their classes, and the app's own `main.css`,
// whose `@theme static` variables the app always defines.
const read = (path: string) => readFileSync(at(path), 'utf8')
const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@source[^;]*;/g, '')
const libraries = clean([
    '@import "tailwindcss/theme.css" layer(theme);',
    read('node_modules/@nuxt/ui/dist/runtime/index.css')
        .replace('@import "#build/ui.css";', read('.nuxt/ui.css'))
        .replace('@import "./keyframes.css";', read('node_modules/@nuxt/ui/dist/runtime/keyframes.css')),
].join('\n'))
const app = clean(read('app/assets/css/main.css').replace(/@import\s+['"](tailwindcss|@nuxt\/ui)['"][^;]*;/g, ''))
const imports = [...libraries.match(/@import[^;]*;/g) ?? [], ...app.match(/@import[^;]*;/g) ?? []]
if (imports.length !== 1) fail(`theme: the host's CSS imports what this build doesn't inline: ${imports.slice(1).join(' ')}`)
write(join(dist, 'theme-libraries.css'), libraries)
write(join(dist, 'theme-app.css'), app)
copyFileSync(join(pkg, 'src/tailwind.css'), join(dist, 'tailwind.css'))

// The preset, with the kernel's manifest check bundled in.
await build({
    configFile: false,
    logLevel: 'warn',
    build: {ssr: join(pkg, 'src/vite.ts'), outDir: dist, emptyOutDir: false, rolldownOptions: {output: {entryFileNames: 'vite.js'}}},
})
