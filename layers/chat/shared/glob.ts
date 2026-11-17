/**
 * A glob over workspace-relative `/` paths as a case-insensitive RegExp: `*` any characters but `/`, `**` any folders
 * (`a/**\/b` also matches `a/b`), `?` one character but `/`, `{x,y}` either (nested too). A pattern without `/` matches
 * a name in any folder, as `.gitignore` and ripgrep read one; a leading `/` (or `./`) keeps it to the top level. Every
 * other character is literal.
 */
export function globToRegExp(glob: string): RegExp {
    const trimmed = glob.trim()
    const anchored = /^\.?\//.test(trimmed)
    const pattern = trimmed.replace(/^\.?\//, '')
    const source = anchored || pattern.includes('/') ? pattern : `**/${pattern}`
    let i = 0
    const parse = (inBraces: boolean): string => {
        let out = ''
        while (i < source.length) {
            const c = source[i]!
            if (inBraces && (c === ',' || c === '}')) return out
            i++
            if (c === '*') {
                if (source[i] === '*') {
                    i++
                    // `**/` is zero or more folders; a bare `**` anything.
                    if (source[i] === '/') {
                        i++
                        out += '(?:.*/)?'
                    } else out += '.*'
                } else out += '[^/]*'
            } else if (c === '?') out += '[^/]'
            else if (c === '{') {
                const options: string[] = []
                for (;;) {
                    options.push(parse(true))
                    if (source[i] === ',') i++
                    else break
                }
                if (source[i] === '}') i++
                out += `(?:${options.join('|')})`
            } else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&')
        }
        return out
    }
    return new RegExp(`^${parse(false)}$`, 'i')
}
