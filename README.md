# Vertex
A Markdown Editor using `@type32/codemirror-rich-obsidian-editor` + Nuxt v4 + Nuxt UI v4 + Tauri v2.

## Learning

Please check out [Concepts and Structures.md](Concepts%20and%20Structures.md) to grasp general concepts of the Vertex.

## Development Roadmap

### Core (Chronologically Ordered)

- [X] Multi-window file contexts
- [X] File CRUD
- [ ] App Settings
  - [ ] App Theme Customization
- [ ] QoL 1
  - [ ] Window Context Restoration needs to restore opened folders
  - [ ] Folders with same names can be opened at the same time in the file tree
- [ ] Markdown Frontmatter Editing Form Tool (inspired by Nuxt Studio's Form Editor)
- [ ] Writing Analyzer (using `compromise`)
- [ ] Code Prose components (e.g. render `mermaid` code blocks as a Mermaid Graph, `base` code blocks as a Base view, etc.)
- [ ] Obsidian Bases support (including base views, edit, sort, all kinds of functions)
- [ ] Image/Asset Upload & Insert
- [ ] Asset Viewing (e.g. open images/pdfs/videos in tabs)

### Advanced

- [ ] Vertex Workflows
- [ ] Vertex Plugins
- [ ] Vertex file exports (e.g. PDF export)
- [ ] Vertex Library (self-hosted FOSS Vertex Workspaces serving/cloud-storage-sync site)
- [ ] Obsidian JSON Canvas CRUD support