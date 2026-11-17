import {readdirSync, readFileSync} from 'node:fs'
import ts from 'typescript'
import {describe, expect, it} from 'vitest'

/**
 * The author docs (`docs/`) against the contract (`shared/plugin/api.ts`): every member of `PluginContext` (its
 * `HostServices` included) and of `SessionContext` is named in a heading, as `ctx.<path>` and `session.<path>`, and no
 * heading names one that isn't there. A member whose type is written inline (`views: {panel(…), …}`) is named by its
 * members. Each contribution point is a member (`ctx.views.panel`), so they're covered too.
 */
function contractNames(): string[] {
    const file = ts.createSourceFile('api.ts', readFileSync(new URL('../../../shared/plugin/api.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest)
    const interfaces = new Map<string, ts.InterfaceDeclaration>()
    ts.forEachChild(file, node => void (ts.isInterfaceDeclaration(node) && interfaces.set(node.name.text, node)))
    const names: string[] = []
    const walk = (members: ts.NodeArray<ts.TypeElement>, prefix: string) => {
        for (const member of members) {
            if (!member.name || !ts.isIdentifier(member.name)) continue
            const path = `${prefix}.${member.name.text}`
            if (ts.isPropertySignature(member) && member.type && ts.isTypeLiteralNode(member.type)) walk(member.type.members, path)
            else if (!names.includes(path)) names.push(path)
        }
    }
    const walkInterface = (name: string, prefix: string) => {
        const node = interfaces.get(name)!
        for (const clause of node.heritageClauses ?? []) for (const type of clause.types) walkInterface(type.expression.getText(file), prefix)
        walk(node.members, prefix)
    }
    walkInterface('PluginContext', 'ctx')
    walkInterface('SessionContext', 'session')
    return names
}

/** What the docs' headings name: each `` `ctx.…` `` or `` `session.…` `` in one, up to a `(`. */
function documentedNames(): Set<string> {
    const dir = new URL('../docs/', import.meta.url)
    const names = new Set<string>()
    for (const page of readdirSync(dir).filter(f => f.endsWith('.md'))) {
        for (const line of readFileSync(new URL(page, dir), 'utf8').split('\n')) {
            if (!/^#{1,6} /.test(line)) continue
            for (const [, code] of line.matchAll(/`([^`]+)`/g)) if (/^(ctx|session)\./.test(code!)) names.add(code!.replace(/\(.*$/, ''))
        }
    }
    return names
}

describe('the author docs', () => {
    const contract = contractNames()
    const documented = documentedNames()

    it('read the contract', () => {
        expect(contract).toContain('ctx.views.panel')
        expect(contract).toContain('ctx.i18n.t')
        expect(contract).toContain('session.files.drag.start')
    })

    it('name every member of the contract in a heading', () => {
        expect(contract.filter(name => !documented.has(name))).toEqual([])
    })

    it('name nothing the contract lacks', () => {
        expect([...documented].filter(name => !contract.includes(name))).toEqual([])
    })
})
