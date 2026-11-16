/**
 * The vault as programs and plugins see it, over vault-relative `/` paths (`session.files.vault()` is the workspace's):
 * `Vault` and `VaultEntry`, path helpers, tags and patterns, and frontmatter written as Obsidian writes it, the kernel's
 * one writer for edits outside the editor (`obsidianYaml` takes the editor package's `frontmatterRange`;
 * `setFrontmatterProperty` changes one key of a note's text with it).
 */
export * from '#shared/utils/vault'
