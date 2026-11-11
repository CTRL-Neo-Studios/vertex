# Package Issues

Problems found in packages Vertex depends on. They need fixing in the package itself; Vertex either works around them (noted with where) or lives with them.

## Own packages

| Package | Version | Problem | Seen as | In Vertex |
|---|---|---|---|---|
| `@type32/obsidian-bases-parser` | 0.3.4 (latest) | The build runs its example code at import: module-level `console.log` calls for a sample task-tracker base. They start at `dist/index.mjs` line 3855 (`console.log("Tokens:", tokens)`) and run through `Active tasks:`, `Total count:`, `Groups:`, `Summaries:` and the serialized YAML. | About 20 log lines (Tokens, Parse result, Filter uses…, YAML Output, Active tasks…) whenever the parser loads. | Nothing to work around. Take the examples out of the package's entry or build. |

## Third-party

| Package | Version | Problem | Seen as | In Vertex |
|---|---|---|---|---|
| `@nuxt/ui` `UTree` with `virtualize` | as installed | It passes Reka's `TreeVirtualizer` `:text-content="(item) => getItemLabel(item.value)"`, but Reka already hands it the item, so every label is `undefined`. | `TypeError: undefined is not an object (evaluating 'value.toLowerCase')` from Reka's `getNextMatch` on any key that isn't a navigation key (letters, Shift, Esc, Delete) while the tree is focused. | Worked around in `FileTreeComponent.vue` (`TREE_VIRTUALIZE`), which passes its own `textContent` through the `virtualize` object. |
| `reka-ui` `TreeVirtualizer` | as installed | Typeahead focuses the matching row's `li` (`[data-index]`), which isn't focusable, so focus never moves. The current row is also read from the focused element's `data-index`, which the focused row (inside the `li`) doesn't carry. | Typing a letter in a virtual tree does nothing. | Not worked around; type-to-find in Files doesn't work. |
