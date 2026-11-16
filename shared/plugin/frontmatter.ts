/**
 * Frontmatter written as Obsidian writes it, the kernel's one writer for edits outside the editor: `obsidianYaml` takes
 * the editor package's `frontmatterRange`, and `setFrontmatterProperty` changes one key of a note's text with it.
 */
export {obsidianYaml, setFrontmatterProperty, type YamlTools} from '#shared/utils/vault'
