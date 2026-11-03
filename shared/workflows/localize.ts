import type {DataPortDef, LanguageManifest} from '@type32/workflows/core'

/** Looks up a key, with `{input}` placeholders kept as they are; `undefined` when there's no such text. */
export type Lookup = (key: string, placeholders: Record<string, string>) => string | undefined

/**
 * `manifest` with its labels and descriptions looked up by `text`, where it has them: `nodes.<type>.label`,
 * `.description` and `.ports.<port>` (data and exec ports), `categories.<id>`, `types.<id>`, and
 * `capabilities.<id>.label` and `.description`. Ids nest at their dots, like i18n keys.
 */
export function localizeManifest(manifest: LanguageManifest, text: Lookup): LanguageManifest {
    const plain = (key: string) => text(key, {})
    const ports = (type: string, defs: Record<string, DataPortDef> | undefined) => defs && Object.fromEntries(
        Object.entries(defs).map(([name, def]) => [name, {...def, label: plain(`nodes.${type}.ports.${name}`) ?? def.label}]))
    return {
        ...manifest,
        types: manifest.types.map(t => ({...t, label: plain(`types.${t.id}`) ?? t.label})),
        capabilities: manifest.capabilities.map(c => ({
            ...c,
            label: plain(`capabilities.${c.id}.label`) ?? c.label,
            description: plain(`capabilities.${c.id}.description`) ?? c.description,
        })),
        categories: manifest.categories?.map(c => ({...c, label: plain(`categories.${c.id}`) ?? c.label})),
        nodes: manifest.nodes.map(n => {
            const placeholders = Object.fromEntries(Object.keys(n.inputs ?? {}).map(name => [name, `{${name}}`]))
            const labels = n.exec && Object.fromEntries(n.exec.out.flatMap(port => {
                const label = plain(`nodes.${n.type}.ports.${port}`)
                return label === undefined ? [] : [[port, label]]
            }))
            return {
                ...n,
                label: text(`nodes.${n.type}.label`, placeholders) ?? n.label,
                description: plain(`nodes.${n.type}.description`) ?? n.description,
                inputs: ports(n.type, n.inputs),
                outputs: ports(n.type, n.outputs),
                ...(n.exec && {exec: {...n.exec, labels}}),
            }
        }),
    }
}
