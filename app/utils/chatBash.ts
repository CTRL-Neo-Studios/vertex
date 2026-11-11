import type {Bash, InMemoryFs} from "just-bash";

/** Where the workspace is in the sandbox, and the shell's working directory. */
export const WORKSPACE = '/workspace'
const OUTPUT_CHARS = 30_000
const TIMEOUT_MS = 10_000

/** A chat reply's shell (`just-bash`: an interpreter, no real processes), and the files its last command wrote. */
export interface Sandbox {
    bash: Bash
    fs: InMemoryFs
    written: Set<string>
}

/**
 * A sandbox with the workspace's text files (`paths`, workspace-relative) at {@link WORKSPACE}, each read through
 * `read` on its first use. `just-bash` (about 1.3 MB) loads on the first call. No network, Python or JS: the browser
 * build leaves them out and no network is configured.
 */
export async function createSandbox(paths: string[], read: (path: string) => Promise<string | null>): Promise<Sandbox> {
    // Dynamic on purpose: 1.3 MB that only a chat running `bash` needs stays out of the app's startup chunk.
    const {Bash, InMemoryFs} = await import('just-bash')
    const written = new Set<string>()
    // Every way a command puts text in a file (redirects, tee, sed -i, cp, mv), by the path it lands at.
    class Tracked extends InMemoryFs {
        override async writeFile(...args: Parameters<InMemoryFs['writeFile']>) {
            written.add(args[0])
            return super.writeFile(...args)
        }

        override async appendFile(...args: Parameters<InMemoryFs['appendFile']>) {
            written.add(args[0])
            return super.appendFile(...args)
        }

        override async cp(...args: Parameters<InMemoryFs['cp']>) {
            written.add(args[1])
            return super.cp(...args)
        }

        override async mv(...args: Parameters<InMemoryFs['mv']>) {
            written.add(args[1])
            return super.mv(...args)
        }
    }
    // ponytail: one Rust read per file on first use, so `grep -r` over thousands of notes is thousands of calls; batch if slow.
    const fs = new Tracked(Object.fromEntries(paths.map(p => [`${WORKSPACE}/${p}`, async () => await read(p) ?? ''])))
    return {bash: new Bash({fs, cwd: WORKSPACE}), fs, written}
}

const capped = (text: string) => text.length > OUTPUT_CHARS ? `${text.slice(0, OUTPUT_CHARS)}\n[… ${text.length - OUTPUT_CHARS} more characters cut]` : text

/** Runs `command` (stopped after 10 s or by `signal`), the AI SDK's bash tool's shape: output cut at 30 000 characters. */
export async function runCommand(box: Sandbox, command: string, signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    box.written.clear()
    const r = await box.bash.exec(command, {signal: signal ? AbortSignal.any([signal, timeout]) : timeout})
    const stderr = timeout.aborted ? `${r.stderr}\n[stopped after ${TIMEOUT_MS / 1000} s]` : r.stderr
    return {stdout: capped(r.stdout), stderr: capped(stderr), exitCode: r.exitCode}
}

/**
 * The workspace files the last command wrote that now differ from `current` (the notes, as the chat sees them):
 * workspace-relative path, the sandbox's text, and whether there's no such note yet. Files it removed again are left
 * out, as are deletions.
 */
export async function sandboxWrites(box: Sandbox, current: (path: string) => Promise<string | null>) {
    const writes: { path: string, text: string, create: boolean }[] = []
    for (const at of box.written) {
        if (!at.startsWith(`${WORKSPACE}/`)) continue
        const stat = await box.fs.stat(at).catch(() => null)
        if (!stat?.isFile) continue
        const path = at.slice(WORKSPACE.length + 1)
        const [text, now] = await Promise.all([box.fs.readFile(at), current(path)])
        if (text !== now) writes.push({path, text, create: now === null})
    }
    return writes
}
