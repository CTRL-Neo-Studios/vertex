# Package Issues

Problems found in packages Vertex depends on. They need fixing in the package itself; Vertex either works around them (noted with where) or lives with them.

## Own packages

| Package | Version | Problem | Seen as | In Vertex |
|---|---|---|---|---|
| `@type32/obsidian-bases-parser` | 0.3.4, **fixed in 0.4.0** | The build ran its example code at import: module-level `console.log` calls for a sample task-tracker base. They started at `dist/index.mjs` line 3855 (`console.log("Tokens:", tokens)`) and ran through `Active tasks:`, `Total count:`, `Groups:`, `Summaries:` and the serialized YAML. | About 20 log lines (Tokens, Parse result, Filter uses…, YAML Output, Active tasks…) whenever the parser loaded. | **Fixed.** `src/obsidian-bases-example.ts` is plain data, and the demo is `examples/walkthrough.ts`, outside the build. Vertex is on `^0.4.0`, and its build has none of the logs. |
| `@type32/codemirror-rich-obsidian-editor` | 0.3.8, **fixed in 0.3.9** | Block prose decorations rebuilt only on doc changes, not when the background parser reached more of a long note. | Embeds (`![[x.base]]`, ` ```base `) past the first few thousand characters of a note never rendered until it was edited. | **Fixed** (`createProsePlugin`, regression test in `test/prose-plugin.test.ts`). |
| `@type32/codemirror-rich-obsidian-editor` | 0.4.0, **fixed in 0.4.1** | `ui.properties.type` was both the type menu's label and the prefix of the type names (`ui.properties.type.text`…). | Nested i18n files can't hold both, so the menu's title couldn't be translated. | **Fixed:** the title is `ui.properties.typeMenu`. Vertex translates every `ui.properties.*` label. |
| `@type32/codemirror-rich-obsidian-editor` | 0.4.0–0.4.1, **fixed in 0.4.2** | In a list property's input, the second Escape moved focus to the row, and the input's `focusout` added the typed draft. | Typing then Escape, Escape added the text as a pill; Obsidian adds nothing. | **Fixed:** Escape drops the draft. |
| `@type32/codemirror-rich-obsidian-editor` | 0.4.0–0.4.3, **fixed in 0.4.4** | The link plugin also drew embeds inside rendered callouts and tables, which their nested editors already draw; and a click inside an embed in a callout selected the callout's source. | Every `![[x]]` in a callout or table cell rendered twice (the copy below the widget); clicking a base's toolbar in a callout turned the callout back into source. | **Fixed:** `inRenderedCallout`/`inRenderedTable` skip those embeds, and the callout leaves clicks in embeds alone. Regression test in `test/prose-plugin.test.ts`. |
| `@type32/codemirror-rich-obsidian-editor` | 0.4.0 | Picking a property type converts the note's value (`convertValue` in `setType`); Obsidian never rewrites a value when its type changes. | Picking Number for `score: "12"` rewrites it as `12`; in Obsidian the note stays as it was. | Open, a library design choice: Vertex lives with it. |
| `@type32/codemirror-rich-obsidian-editor` | 0.3–0.4 | The six block prose plugins (callouts, code, links, math, tables, plain links) rebuild their decorations across the whole note on every keystroke. | About 9 ms a keystroke per 100 KB of note, about 75 ms at 1 MB (V8, measured with a throwaway benchmark). | Open: fine at typical sizes; making them incremental would fix it. |

## Third-party

| Package | Version | Problem | Seen as | In Vertex |
|---|---|---|---|---|
| `@nuxt/ui` `UTree` with `virtualize` | as installed | It passes Reka's `TreeVirtualizer` `:text-content="(item) => getItemLabel(item.value)"`, but Reka already hands it the item, so every label is `undefined`. | `TypeError: undefined is not an object (evaluating 'value.toLowerCase')` from Reka's `getNextMatch` on any key that isn't a navigation key (letters, Shift, Esc, Delete) while the tree is focused. | Worked around in `FileTreeComponent.vue` (`TREE_VIRTUALIZE`), which passes its own `textContent` through the `virtualize` object. |
| `reka-ui` `TreeVirtualizer` | as installed | Typeahead focuses the matching row's `li` (`[data-index]`), which isn't focusable, so focus never moves. The current row is also read from the focused element's `data-index`, which the focused row (inside the `li`) doesn't carry. | Typing a letter in a virtual tree does nothing. | Not worked around; type-to-find in Files doesn't work. |
