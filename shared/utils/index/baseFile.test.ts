import {describe, expect, it} from 'vitest'
import {RowScope, toText, type BaseHost} from '@type32/obsidian-bases-parser'
import {parseYaml, parseFrontmatter} from '../../../node_modules/@type32/codemirror-rich-obsidian-editor/dist/runtime/utils/frontmatter.js'
import {defaultActiveWorkspaceFileIndex} from '#shared/utils/defaults/actives'
import {baseFile} from './baseFile'
import {LinkGraph} from './linkGraph'
import {parseLinkTargets, parseNoteMeta, parseProperties} from './parse'
import {getInternalLinks} from './rewriteLinks'

const parsers = {parseYaml, parseFrontmatter, getInternalLinks}

// The probe notes, and what Obsidian 1.15.1's Bases showed for them (formulas `file.tags`, `file.links`, … in a table).
const A = `---
tags: [fm]
rel: "[[C]]"
note: see [[D]] here
due: 2026-11-20
dt: 2026-10-01T10:30:00
---
# Heading #inhead
Text #probe and a#notag, #123, #1a, #a-b/c_d, #émoji, (#paren) #trail. #UpperCase
\`#incode\` and [[B]] [[C#Sec]] [[B#^blk]] [[C|Alias]] ![[B]] ![[img.png|300]] [[ B ]]
\`\`\`
#infence [[D]]
\`\`\`
%% #incomment [[E]] %%
<!-- #inhtml [[F]] -->
[md](B.md) [md2](<C.md>) http://x.com/#anchor $#math$ [[sub/S]]
`
const OBSIDIAN = {
    'zz-v0/A.md': {
        'file.tags': '#inhead, #probe, #1a, #a-b/c_d, #émoji, #trail, #UpperCase, #incomment, #fm',
        'file.links': '[[C|C]], [[B|B]], [[C#Sec|C > Sec]], [[B#^blk|B > ^blk]], [[C|Alias]], [[B|B]], [[E|E]], [[B.md|md]], [[C.md|md2]], [[sub/S|sub/S]], [[B|B]], [[img.png|300]]',
        'file.embeds': '[[B|B]], [[img.png|300]]',
        'file.backlinks': '',
        'note.due': '2026-11-20',
        'note.dt': '2026-10-01T10:30:00',
        'file.hasLink("B")': 'true',
    },
    'zz-v0/B.md': {'file.tags': '', 'file.links': '', 'file.backlinks': '[[zz-v0/A.md|A]]', 'file.hasLink("B")': 'false'},
    'zz-v0/C.md': {'file.backlinks': '[[zz-v0/A.md|A]]'},
}

/** The workspace as the index builds it (same parsing as `useActiveWorkspaceIndex`), seen through `baseFile`. */
function workspace(files: Record<string, string>): BaseHost {
    const graph = new LinkGraph()
    const nodes = new Map(Object.entries(files).map(([path, content]) => {
        const {properties} = parseProperties(path, content, parsers)
        return [path, defaultActiveWorkspaceFileIndex({uuid: path, relativePath: path, size: content.length, properties, meta: parseNoteMeta(content, properties)})]
    }))
    for (const path of nodes.keys()) graph.addFile({id: path, relativePath: path})
    for (const [path, content] of Object.entries(files)) graph.setLinks(path, parseLinkTargets(path, content, parsers))
    return {
        file: path => nodes.has(path) ? baseFile(nodes.get(path)!) : null,
        resolve: link => graph.resolveTarget(link) ?? null,
        backlinks: path => graph.backlinks(path),
    }
}

describe('Bases rows from the index', () => {
    it('match what Obsidian shows for the probe notes', () => {
        const host = workspace({'zz-v0/A.md': A, 'zz-v0/B.md': 'b', 'zz-v0/C.md': 'c', 'zz-v0/P.base': ''})
        for (const [path, expected] of Object.entries(OBSIDIAN)) {
            const row = new RowScope({host, now: Date.now(), thisPath: 'zz-v0/P.base', formulas: {}}, path)
            const actual = Object.fromEntries(Object.keys(expected).map(e => [e, toText(row.evaluate(e))]))
            expect(actual, path).toEqual(expected)
        }
    })
})
