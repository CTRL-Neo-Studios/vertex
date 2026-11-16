/**
 * Who may import whom, checked on the sources (Plugin Architecture Plan, K1):
 * 1. the kernel (`app/`, `shared/`) never reaches into a layer, by import or by component tag; nor into feature code
 *    that still lives in `app/` or `shared/` (`RESIDENTS`), outside `app/builtins/` and `KERNEL_EXCEPTIONS`;
 * 2. a layer reaches another layer only through its `app/api.ts`, and only one its manifest requires;
 * 3. a layer reaches the kernel only through the public contract (`shared/plugin/`), or through a kernel module listed
 *    for it in `EXCEPTIONS` with the reason; an exception it no longer uses fails, so the lists only shrink;
 * 4. a layer has no folder Nuxt auto-imports app-wide, and uses no kernel auto-import without importing it, so every
 *    use is an import the rules above see.
 */
import {describe, expect, it} from 'vitest'

/** Layer id → kernel module (path without extension) → why the layer still needs it. */
const EXCEPTIONS: Record<string, Record<string, string>> = {}

/**
 * Feature code still in `app/` and `shared/`, by the plugin its X phase moves it into: module paths, or folders ending
 * in `/`. Rule 1 holds the kernel to it as to a layer; each phase deletes its entry.
 */
const RESIDENTS: Record<string, string[]> = {
    'bases': ['app/components/ViewerEditor/Bases/', 'app/components/ViewerEditor/BasesViewer', 'app/composables/bases/', 'app/utils/bases', 'shared/utils/index/baseFile'],
    'files': ['app/components/FileTreeComponent', 'app/components/LayoutComponents/PanelFilesView'],
    'palette': ['app/components/WorkspaceCommandPalette', 'app/components/CommandPaletteButton'],
    'workflows': [
        'app/components/Workflow/', 'app/components/ViewerEditor/WorkflowViewer', 'app/components/Modals/Workflow',
        'app/components/Settings/Workflows/', 'app/composables/workflows/', 'shared/workflows/',
    ],
    'ai': [
        'app/composables/ai/useAiConfig', 'app/composables/ai/useAiModels', 'app/utils/aiClient', 'app/utils/aiFetch',
        'app/components/Settings/Ai/', 'shared/utils/ai/', 'shared/utils/aiParams', 'shared/constants/ai', 'shared/types/app/ai',
    ],
    'git': ['app/components/Git/', 'app/composables/git/', 'app/utils/git', 'app/components/Settings/Git/', 'shared/utils/gitGraph', 'shared/types/app/git'],
    'chat': [
        'app/components/Chat/', 'app/components/Modals/ImportToChatModal', 'app/composables/ai/useChat', 'app/utils/chat',
        'app/utils/comarkPlugins', 'app/utils/webPage', 'shared/types/app/chats',
    ],
    'ai-assistant': ['app/composables/ai/useAiEditorExtension'],
}

/** Kernel module → feature module it still reaches → why, and the phase that ends it. An unused entry fails. */
const KERNEL_EXCEPTIONS: Record<string, Record<string, string>> = {
    'app/layouts/session': {
        'app/components/WorkspaceCommandPalette': 'the session layout draws the palette: X4 makes it the palette plugin',
    },
    'shared/types/app/settings': {
        'shared/types/app/ai': '`AppSettings.aiConfig`: X6 moves it to `plugins.config.ai`',
    },
    'shared/utils/defaults/apps': {
        'shared/types/app/ai': 'the AI settings defaults: X6 moves them to `plugins.config.ai`',
        'shared/types/app/chats': '`aiConfig.chatMode`: X8 moves it to `plugins.config.chat`',
        'shared/utils/aiParams': 'model params in the AI settings defaults: X6',
    },
}

/** Kernel modules every plugin may import: the contract, and the published UI components. */
const PUBLIC = ['shared/plugin/', 'app/plugin/ui']

type Files = Record<string, string>
interface Violation {
    rule: 'kernel-reaches-layer' | 'kernel-reaches-feature' | 'layer-reaches-layer' | 'layer-reaches-kernel' | 'layer-layout' | 'stale-exception'
    file: string
    detail: string
}

const normalize = (path: string) => {
    const out: string[] = []
    for (const part of path.split('/')) {
        if (part === '..') out.pop()
        else if (part && part !== '.') out.push(part)
    }
    return out.join('/')
}
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
const withoutExt = (path: string) => path.replace(/(\.d)?\.(ts|vue|mjs|js|json)$/, '')
const pascal = (name: string) => name.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
const layerOf = (path: string) => /^layers\/([^/]+)\//.exec(path)?.[1]

/** A module specifier as a repository path (`components` for `#components`); `null` for a package. */
function resolveSpecifier(spec: string, from: string): string | null {
    if (spec === '#components') return 'components'
    if (spec.startsWith('~/') || spec.startsWith('@/')) return normalize(`app/${spec.slice(2)}`)
    if (spec.startsWith('~~/') || spec.startsWith('@@/')) return normalize(spec.slice(3))
    if (spec === '#shared' || spec.startsWith('#shared/')) return normalize(`shared/${spec.slice(8)}`)
    if (spec.startsWith('#layers/')) return normalize(`layers/${spec.slice(8)}`)
    if (spec.startsWith('./') || spec.startsWith('../')) return normalize(`${dirOf(from)}/${spec}`)
    return null
}

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const withoutStrings = (source: string) => source.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')

function specifiers(source: string): string[] {
    const code = withoutComments(source)
    return [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g)]
        .map(m => (m[1] ?? m[2] ?? m[3])!)
}

/**
 * Names imported from `#components`, and the component tags a `.vue` template uses, without `Lazy`. A tag named after
 * something the file imports from elsewhere (`import {NoteEditor} from '~/plugin/ui'`) is that import, whose module the
 * import rules check, not the auto-imported component of the same name.
 */
function componentsUsed(path: string, source: string): string[] {
    const code = withoutComments(source)
    const named = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]#components['"]/g)]
        .flatMap(m => m[1]!.split(',').map(s => s.trim().split(/\s+as\s+/)[0]!.trim()).filter(Boolean))
    const imported = new Set([...code.matchAll(/import\s+(?:type\s+)?([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g)]
        .filter(m => m[3] !== '#components')
        .flatMap(m => [m[1], ...(m[2]?.split(',').map(s => s.trim().split(/\s+as\s+/).pop()!.trim()) ?? [])])
        .filter(Boolean))
    const template = path.endsWith('.vue') ? /<template[\s\S]*<\/template>/.exec(source)?.[0] ?? '' : ''
    const tags = [
        ...[...template.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map(m => m[1]!),
        ...[...template.matchAll(/<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g)].map(m => pascal(m[1]!)),
    ].filter(tag => !imported.has(tag))
    return [...named, ...tags].map(n => n.replace(/^Lazy(?=[A-Z])/, ''))
}

/** Component name → file, for the `.vue` files under `root` (Nuxt's naming: prefix, folders, file; a folder the file name repeats is dropped). */
function componentNames(files: Files, root: string, prefix: string): Map<string, string> {
    const names = new Map<string, string>()
    for (const path of Object.keys(files)) {
        if (!path.startsWith(root) || !path.endsWith('.vue')) continue
        const parts = withoutExt(path.slice(root.length)).split('/').map(pascal)
        let file = parts.pop()!
        if (file === 'Index' && parts.length) file = parts.pop()!
        if (parts.length && file.startsWith(parts.at(-1)!)) parts.pop()
        names.set(`${prefix}${parts.join('')}${file}`, withoutExt(path))
    }
    return names
}

/** Names Nuxt auto-imports from kernel modules (`app/utils/*`, `app/composables/*`, `shared/utils/*`, `shared/types/*`), by module. */
function kernelAutoImports(files: Files): Map<string, string> {
    const names = new Map<string, string>()
    for (const [path, source] of Object.entries(files)) {
        if (!/^(app\/(utils|composables)|shared\/(utils|types))\/[^/]+\.ts$/.test(path) || path.endsWith('.test.ts')) continue
        for (const m of source.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/gm)) {
            names.set(m[1]!, withoutExt(path))
        }
    }
    return names
}

/** The plugin a resident module (path without extension) belongs to: a listed module, or a file under a listed folder or name prefix. */
const residentOf = (residents: Record<string, string[]>, module: string) =>
    Object.entries(residents).find(([, prefixes]) => prefixes.some(p => module === p || module.startsWith(p)))?.[0]

function checkBoundaries(
    files: Files,
    exceptions: Record<string, Record<string, string>>,
    residents: Record<string, string[]> = {},
    kernelExceptions: Record<string, Record<string, string>> = {},
): Violation[] {
    const violations: Violation[] = []
    const add = (rule: Violation['rule'], file: string, detail: string) => violations.push({rule, file, detail})
    const layers = new Set(Object.keys(files).map(layerOf).filter((id): id is string => !!id))
    const kernelUsed = new Set<string>()
    /** A kernel module reaching a resident one: fine when the exception lists it. */
    const reachesFeature = (from: string, target: string, detail: string) => {
        const feature = residentOf(residents, target)
        if (!feature) return
        if (kernelExceptions[withoutExt(from)]?.[target]) kernelUsed.add(`${withoutExt(from)} ${target}`)
        else add('kernel-reaches-feature', from, `${detail} (${feature})`)
    }

    const requires = new Map<string, string[]>()
    const layerComponents = new Map<string, string>()
    for (const id of layers) {
        const manifest = files[`layers/${id}/plugin.json`]
        if (!manifest) add('layer-layout', `layers/${id}`, 'no plugin.json')
        requires.set(id, ((manifest ? JSON.parse(manifest).requires : undefined) ?? []).map((r: string) => r.replace(/\?$/, '')))
        const prefix = /prefix:\s*['"]([A-Za-z0-9]*)['"]/.exec(files[`layers/${id}/nuxt.config.ts`] ?? '')?.[1] ?? ''
        for (const [name, file] of componentNames(files, `layers/${id}/app/components/`, prefix)) layerComponents.set(name, file)
    }
    const kernelComponents = componentNames(files, 'app/components/', '')
    const autoImports = kernelAutoImports(files)
    const used = new Map<string, Set<string>>()
    const mayUseKernel = (layer: string, target: string) => {
        if (PUBLIC.some(p => target.startsWith(p))) return true
        if (!exceptions[layer]?.[target]) return false
        used.set(layer, (used.get(layer) ?? new Set()).add(target))
        return true
    }

    for (const [path, source] of Object.entries(files)) {
        if (path.endsWith('.test.ts') || path.endsWith('.json')) continue
        const layer = layerOf(path)
        const kernel = path.startsWith('app/') || path.startsWith('shared/')
        if (!layer && !kernel) continue
        const targets = specifiers(source).map(s => resolveSpecifier(s, path)).filter((t): t is string => !!t && t !== 'components').map(withoutExt)
        const components = componentsUsed(path, source)

        if (kernel) {
            for (const t of targets) if (t.startsWith('layers/')) add('kernel-reaches-layer', path, `imports ${t}`)
            for (const c of components) if (layerComponents.has(c)) add('kernel-reaches-layer', path, `uses <${c}> from ${layerComponents.get(c)}`)
            // Feature code reaches feature code freely until its X phase; the builtins are where it plugs in.
            if (residentOf(residents, withoutExt(path)) || path.startsWith('app/builtins/')) continue
            for (const t of targets) reachesFeature(path, t, `imports ${t}`)
            for (const c of components) {
                const file = kernelComponents.get(c)
                if (file) reachesFeature(path, file, `uses <${c}> from ${file}`)
            }
            const code = withoutStrings(withoutComments(source))
            for (const [name, module] of autoImports) {
                if (!residentOf(residents, module) || !new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(code)) continue
                const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(code)
                const declared = new RegExp(`\\b(?:const|let|var|function|class|type|interface|enum)\\s+${name}\\b`).test(code)
                if (!imported && !declared) reachesFeature(path, module, `uses ${name}, auto-imported from ${module}`)
            }
            continue
        }

        for (const dir of ['app/composables/', 'app/utils/', 'shared/utils/', 'shared/types/']) {
            if (path.startsWith(`layers/${layer}/${dir}`)) add('layer-layout', path, `${dir} is auto-imported app-wide; use app/lib/ or shared/`)
        }
        for (const t of targets) {
            const other = layerOf(`${t}/`)
            if (other && other !== layer) {
                if (t !== `layers/${other}/app/api` || !requires.get(layer!)!.includes(other)) add('layer-reaches-layer', path, `imports ${t}`)
            } else if ((t.startsWith('app/') || t.startsWith('shared/')) && !mayUseKernel(layer!, t)) {
                add('layer-reaches-kernel', path, `imports ${t}`)
            }
        }
        for (const c of components) {
            const own = layerComponents.get(c)
            if (own && layerOf(`${own}/`) !== layer) add('layer-reaches-layer', path, `uses <${c}> from ${own}`)
            const kernelFile = kernelComponents.get(c)
            if (kernelFile && !own && !mayUseKernel(layer!, kernelFile)) add('layer-reaches-kernel', path, `uses <${c}> from ${kernelFile}`)
        }
        const code = withoutStrings(withoutComments(source))
        for (const [name, module] of autoImports) {
            if (!new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(code)) continue
            const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(code)
            const declared = new RegExp(`\\b(?:const|let|var|function|class|type|interface|enum)\\s+${name}\\b`).test(code)
            if (!imported && !declared) add('layer-reaches-kernel', path, `uses ${name}, auto-imported from ${module}; import it`)
        }
    }

    for (const [layer, list] of Object.entries(exceptions)) {
        for (const target of Object.keys(list)) {
            if (!used.get(layer)?.has(target)) add('stale-exception', `layers/${layer}`, `no longer uses ${target}; remove the exception`)
        }
    }
    for (const [from, list] of Object.entries(kernelExceptions)) {
        for (const target of Object.keys(list)) {
            if (!kernelUsed.has(`${from} ${target}`)) add('stale-exception', from, `no longer reaches ${target}; remove the exception`)
        }
    }
    return violations
}

/** Vite keys globbed files relative to this file (`../utils/x.ts` is `shared/utils/x.ts`): repository paths. */
const load = (modules: Record<string, unknown>): Files =>
    Object.fromEntries(Object.entries(modules).map(([path, source]) => [normalize(`shared/plugin/${path}`), source as string]))

describe('plugin boundaries', () => {
    it('hold in the sources', () => {
        const files = load({
            ...import.meta.glob(['../../app/**/*.{ts,vue}', '../../shared/**/*.ts'], {query: '?raw', import: 'default', eager: true}),
            ...import.meta.glob(['../../layers/*/**/*.{ts,vue,json}', '!../../layers/*/node_modules/**'], {query: '?raw', import: 'default', eager: true}),
        })
        // The globs found the sources (a wrong pattern would make this pass on nothing).
        expect(Object.keys(files).filter(p => p.startsWith('app/')).length).toBeGreaterThan(100)
        expect(Object.keys(files).filter(p => p.startsWith('shared/')).length).toBeGreaterThan(50)
        expect(checkBoundaries(files, EXCEPTIONS, RESIDENTS, KERNEL_EXCEPTIONS)).toEqual([])
    })
})

describe('checkBoundaries', () => {
    const layer = (id: string, requires: string[] = []): Files => ({
        [`layers/${id}/plugin.json`]: JSON.stringify({id, requires}),
        [`layers/${id}/nuxt.config.ts`]: `export default defineNuxtConfig({components: [{path: 'components', prefix: '${pascal(id)}'}]})`,
        [`layers/${id}/app/plugin.ts`]: `import {definePlugin} from '#shared/plugin/api'\nexport default definePlugin({setup() {}})`,
        [`layers/${id}/app/api.ts`]: 'export interface Api {}',
        [`layers/${id}/app/lib/inner.ts`]: 'export const inner = 1',
        [`layers/${id}/app/components/View.vue`]: '<template><div/></template>',
    })
    const kernel: Files = {
        'app/utils/stateClient.ts': 'export const stateClient = {}',
        'app/components/Settings/Row.vue': '<template><div/></template>',
        'shared/plugin/api.ts': 'export const definePlugin = (d: unknown) => d',
    }
    const rules = (files: Files, exceptions = {}) => checkBoundaries({...kernel, ...layer('ai'), ...layer('chat', ['ai']), ...files}, exceptions)
        .map(v => `${v.rule} ${v.file}: ${v.detail}`)

    it('passes a clean tree', () => expect(rules({})).toEqual([]))

    it('1: the kernel importing a layer, or using its component', () => {
        expect(rules({
            'app/utils/x.ts': `import {inner} from '#layers/ai/app/lib/inner'`,
            'app/components/Y.vue': '<template><AiView/><ai-view/></template>',
        })).toEqual([
            'kernel-reaches-layer app/utils/x.ts: imports layers/ai/app/lib/inner',
            'kernel-reaches-layer app/components/Y.vue: uses <AiView> from layers/ai/app/components/View',
            'kernel-reaches-layer app/components/Y.vue: uses <AiView> from layers/ai/app/components/View',
        ])
    })

    it('1: the kernel reaching feature code still in app/, unless it is the builtins, a resident, or an exception', () => {
        const residents = {chat: ['app/components/Chat/', 'app/utils/chatClient']}
        const files: Files = {
            'app/components/Chat/Panel.vue': '<template><div/></template>',
            'app/utils/chatClient.ts': 'export const chatClient = {}',
            'app/utils/a.ts': `import {chatClient} from '~/utils/chatClient'`,
            'app/components/B.vue': '<template><ChatPanel/></template>',
            'app/utils/c.ts': 'export const c = () => chatClient',
            'app/utils/allowed.ts': `import {chatClient} from '~/utils/chatClient'`,
            'app/builtins/chat.ts': `import {chatClient} from '~/utils/chatClient'`,
            'app/components/Chat/Other.vue': '<template><ChatPanel/></template>',
        }
        const found = (exceptions: Record<string, Record<string, string>>) =>
            checkBoundaries({...kernel, ...files}, {}, residents, exceptions).map(v => `${v.rule} ${v.file}: ${v.detail}`)
        expect(found({'app/utils/allowed': {'app/utils/chatClient': 'reason'}, 'app/utils/gone': {'app/utils/chatClient': 'reason'}})).toEqual([
            'kernel-reaches-feature app/utils/a.ts: imports app/utils/chatClient (chat)',
            'kernel-reaches-feature app/components/B.vue: uses <ChatPanel> from app/components/Chat/Panel (chat)',
            'kernel-reaches-feature app/utils/c.ts: uses chatClient, auto-imported from app/utils/chatClient (chat)',
            'stale-exception app/utils/gone: no longer reaches app/utils/chatClient; remove the exception',
        ])
    })

    it('2: a layer reaching past another layer\'s API, or one it doesn\'t require', () => {
        expect(rules({
            'layers/chat/app/lib/a.ts': `import type {Api} from '#layers/ai/app/api'\nimport {inner} from '#layers/ai/app/lib/inner'`,
            'layers/ai/app/lib/b.ts': `import type {Api} from '../../../chat/app/api'`,
            'layers/chat/app/components/C.vue': '<template><AiView/></template>',
        })).toEqual([
            'layer-reaches-layer layers/chat/app/lib/a.ts: imports layers/ai/app/lib/inner',
            'layer-reaches-layer layers/ai/app/lib/b.ts: imports layers/chat/app/api',
            'layer-reaches-layer layers/chat/app/components/C.vue: uses <AiView> from layers/ai/app/components/View',
        ])
    })

    it('3: a layer importing the kernel, or using its component, unless the exception lists it; a stale exception', () => {
        const files = {
            'layers/ai/app/lib/a.ts': `import {stateClient} from '~/utils/stateClient'`,
            'layers/ai/app/components/S.vue': '<template><SettingsRow/></template>',
            // The published component, imported by name: not the kernel's auto-imported one.
            'layers/ai/app/components/P.vue': `<script setup>import {SettingsRow} from '~/plugin/ui'</script><template><SettingsRow/></template>`,
        }
        expect(rules(files)).toEqual([
            'layer-reaches-kernel layers/ai/app/lib/a.ts: imports app/utils/stateClient',
            'layer-reaches-kernel layers/ai/app/components/S.vue: uses <SettingsRow> from app/components/Settings/Row',
        ])
        expect(rules(files, {ai: {'app/utils/stateClient': 'reason', 'app/components/Settings/Row': 'reason', 'app/utils/gone': 'reason'}}))
            .toEqual(['stale-exception layers/ai: no longer uses app/utils/gone; remove the exception'])
    })

    it('4: an auto-imported folder in a layer, a kernel auto-import used without importing it, a layer without a manifest', () => {
        expect(rules({
            'layers/ai/app/composables/useAi.ts': 'export const useAi = () => stateClient',
            'layers/stray/app/plugin.ts': '',
        })).toEqual([
            'layer-layout layers/stray: no plugin.json',
            'layer-layout layers/ai/app/composables/useAi.ts: app/composables/ is auto-imported app-wide; use app/lib/ or shared/',
            'layer-reaches-kernel layers/ai/app/composables/useAi.ts: uses stateClient, auto-imported from app/utils/stateClient; import it',
        ])
    })
})
