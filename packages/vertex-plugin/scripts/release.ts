/**
 * Releases the SDK to npm. In this folder:
 *
 *     bun run release <patch | minor | major | prerelease | 1.2.3> [--tag <tag>] [--dry-run]
 *
 * Bumps the version, builds `dist/` from the kernel as it is now, runs the SDK's checks, publishes, then commits the
 * version and tags it `sdk-v<version>` (neither is pushed). A pre-release goes to the `next` tag unless `--tag` says
 * otherwise, so `latest` never moves to one. It refuses a tree with uncommitted changes: what's published is what the
 * tag names. `--dry-run` does everything but publish, commit and tag, from any tree, and puts the version back, as a
 * failed step does. The version as it stands may be given too, to publish one that never was (npm refuses a
 * version it already has).
 */
import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const repo = join(pkg, '../..')
const manifest = join(pkg, 'package.json')

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

/** Runs a command with this terminal (npm's one-time password prompt needs it); throws when it fails. */
function run(cwd: string, command: string, ...args: string[]) {
    console.log(`\n$ ${command} ${args.join(' ')}`)
    if (spawnSync(command, args, {cwd, stdio: 'inherit'}).status !== 0) throw new Error(`${command} ${args[0]} failed`)
}

const {values, positionals} = parseArgs({
    args: process.argv.slice(2),
    options: {tag: {type: 'string'}, 'dry-run': {type: 'boolean', default: false}},
    allowPositionals: true,
})
const [bump] = positionals
if (!bump || positionals.length > 1) fail('Usage: bun run release <patch | minor | major | prerelease | 1.2.3> [--tag <tag>] [--dry-run]')
const dry = values['dry-run']

if (!dry && spawnSync('git', ['status', '--porcelain'], {cwd: repo, encoding: 'utf8'}).stdout.trim()) {
    fail('There are uncommitted changes: commit them first, so the release is what its tag names (or try it with --dry-run).')
}

const before = readFileSync(manifest, 'utf8')
let published = false
try {
    run(pkg, 'bun', 'pm', 'version', bump, '--no-git-tag-version', '--allow-same-version')
    const version: string = JSON.parse(readFileSync(manifest, 'utf8')).version
    const tag = values.tag ?? (version.includes('-') ? 'next' : 'latest')
    console.log(`\n@type32/vertex-plugin ${version}, to npm's "${tag}" tag${dry ? ' (dry run)' : ''}`)

    // The build reads what `nuxt prepare` generates; the tests hold the version's major to `API_VERSION` and the
    // dependencies to the host's.
    run(repo, 'bunx', 'nuxt', 'prepare')
    run(pkg, 'bun', 'run', 'build')
    run(pkg, 'bun', 'run', 'typecheck')
    run(repo, 'bunx', 'vitest', 'run', 'packages/vertex-plugin')
    run(pkg, 'bun', 'publish', '--access', 'public', '--tag', tag, ...(dry ? ['--dry-run'] : []))
    if (!dry) {
        published = true
        if (readFileSync(manifest, 'utf8') !== before) run(repo, 'git', 'commit', '-m', `chore(sdk): release ${version}`, '--', manifest)
        run(repo, 'git', 'tag', `sdk-v${version}`)
        console.log(`\nPublished ${version}. Push it: git push && git push origin sdk-v${version}`)
    }
} catch (error) {
    console.error(`\n${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
} finally {
    // Once published, the version stays whatever failed after: it's on npm, to be committed and tagged by hand.
    if (!published) writeFileSync(manifest, before)
}
