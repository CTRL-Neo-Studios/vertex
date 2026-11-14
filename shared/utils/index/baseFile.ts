import type {BaseFile} from "@type32/obsidian-bases-parser";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";

/**
 * An index entry as Bases reads it, under its workspace-relative path (Obsidian's `file.path`). The index reads
 * frontmatter as YAML 1.2 (the editor's `parseFrontmatter`), so dates stay text, as in Obsidian.
 */
export function baseFile(node: ActiveWorkspaceFileIndex): BaseFile {
    const {tags, links, embeds} = node.meta
    return {
        path: node.relativePath,
        ctime: node.createdTime.getTime(),
        mtime: node.modifiedTime.getTime(),
        size: node.size,
        frontmatter: node.properties,
        tags,
        links: [...links, ...embeds],
        embeds,
    }
}
