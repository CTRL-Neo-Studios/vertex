import {describe, expect, it} from "vitest";
import {workspaceBadge} from "./workspaceBadge";

describe('workspaceBadge', () => {
    it('takes the first letters of the first and last words, or one for a single word', () => {
        const initials = (path: string) => workspaceBadge(path).initials
        expect(initials('/p/tauri-updater-backend')).toBe('TB')
        expect(initials('/p/codemirror-rich-obsidian/')).toBe('CO')
        expect(initials('C:\\Users\\me\\ts lib_template')).toBe('TT')
        expect(initials('/p/vertex')).toBe('V')
        expect(initials('/p/笔记 库')).toBe('笔库')
    })

    it('gives a path the same hue every time', () => {
        const {hue} = workspaceBadge('/p/vertex')
        expect(workspaceBadge('/p/vertex').hue).toBe(hue)
        expect(hue).toBeGreaterThanOrEqual(0)
        expect(hue).toBeLessThan(360)
    })
})
