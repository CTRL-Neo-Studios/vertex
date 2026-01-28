# Vertex
A Markdown Editor using `@type32/codemirror-rich-obsidian-editor` + Nuxt v4 + Nuxt UI v4 + Tauri v2.

## Learning

Please check out [Concepts and Structures.md](Concepts%20and%20Structures.md) to grasp general concepts of the Vertex.

## Development Roadmap

### Core (Chronologically Ordered)

- [X] Multi-window file contexts
- [X] File CRUD
- [X] App Settings
  - [X] App Theme Customization
- [X] QoL 1
  - [X] Window Context Restoration needs to restore opened folders
  - [X] Record last-focused tab
  - [X] Folders with same names can be opened at the same time in the file tree
- [ ] Markdown Frontmatter Editing Form Tool (inspired by Nuxt Studio's Form Editor)
- [ ] Usage Timer (starts whenever a session window is focused, pauses when out of focus, just there to notify you about how long you've been working or smth)
- [ ] Writing Analyzer (using `compromise`)
- [ ] Code Prose components (e.g. render `mermaid` code blocks as a Mermaid Graph, `base` code blocks as a Base view, etc.)
  - [X] `mermaid`
  - [ ] `base`
- [ ] Obsidian Bases support (including base views, edit, sort, all kinds of functions)
- [ ] Simple AI completion stuff
- [ ] Image/Asset Upload & Insert
- [ ] Asset Viewing (e.g. open images/pdfs/videos in tabs)

### Advanced

- [ ] Vertex Workflows
- [ ] Vertex Plugins
- [ ] Vertex file exports (e.g. PDF export)
- [ ] Vertex Library (self-hosted FOSS Vertex Workspaces serving/cloud-storage-sync site)
- [ ] Obsidian JSON Canvas CRUD support