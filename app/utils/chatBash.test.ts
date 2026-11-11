import {describe, expect, it} from "vitest";
import {createSandbox, runCommand, sandboxWrites} from "./chatBash";

const notes: Record<string, string> = {'A/Hub.md': '# Hub\nZEPHYR\n', 'B.md': 'ZEPHYR too\n', 'C.md': 'untouched\n'}
const read = async (path: string) => notes[path] ?? null

describe('chatBash', () => {
    it('reports what a command wrote under /workspace that differs from the notes, with new files as new', async () => {
        const box = await createSandbox(Object.keys(notes), read)
        const r = await runCommand(box, "grep -rl ZEPHYR . | sort | xargs sed -i 's/ZEPHYR/MISTRAL/'; cp C.md D.md; echo x > /tmp/scratch; rm C.md; echo hi > E.md; rm E.md")
        expect(r.exitCode).toBe(0)
        expect(await sandboxWrites(box, read)).toEqual([
            {path: 'A/Hub.md', text: '# Hub\nMISTRAL\n', create: false},
            {path: 'B.md', text: 'MISTRAL too\n', create: false},
            {path: 'D.md', text: 'untouched\n', create: true},
        ])
    })

    it('reports only the last command\'s writes, and none that match the notes again', async () => {
        const box = await createSandbox(Object.keys(notes), read)
        await runCommand(box, "sed -i 's/ZEPHYR/X/' B.md")
        await runCommand(box, "sed -i 's/X/ZEPHYR/' B.md; cat B.md > /tmp/b")
        expect(await sandboxWrites(box, read)).toEqual([])
    })

    it('cuts long output', async () => {
        const long = await runCommand(await createSandbox([], read), 'seq 1 20000')
        expect(long.stdout).toMatch(/^1\n2\n[\s\S]*\[… \d+ more characters cut]$/)
    })
})
