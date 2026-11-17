import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {API_VERSION} from '../../../shared/plugin/manifest'
import {SHARED_PACKAGES} from '../../../shared/plugin/modules'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const sdk = read('../package.json') as { version: string, dependencies: Record<string, string> }

/** `version` is in `^range`: the same major (and minor, below 1.0), not older. */
function inCaret(version: string, range: string): boolean {
    const [a, b, c] = range.slice(1).split('.').map(Number) as [number, number, number]
    const [x, y, z] = version.split(/[.-]/).map(Number) as [number, number, number]
    if (x !== a || (a === 0 && y !== b)) return false
    return y > b || (y === b && z >= c)
}

describe('the SDK', () => {
    it("pins the host's packages: a new major of one is a new apiVersion", () => {
        const roots = new Set(SHARED_PACKAGES.map(id => id.split('/').slice(0, id.startsWith('@') ? 2 : 1).join('/')))
        for (const name of roots) expect(sdk.dependencies, name).toHaveProperty([name])
        for (const [name, range] of Object.entries(sdk.dependencies)) {
            const installed = read(`../../../node_modules/${name}/package.json`).version as string
            expect(inCaret(installed, range), `${name} ${installed} in ${range}`).toBe(true)
        }
        expect(Number(sdk.version.split('.')[0])).toBe(API_VERSION)
    })
})
