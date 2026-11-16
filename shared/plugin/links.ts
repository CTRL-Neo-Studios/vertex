/**
 * Wiki links in Markdown text, read and rewritten as the index does (`[[target#subpath|display]]`, `![[…]]`): for a
 * plugin's link extractor (links inside another format's text) and anything that lists a note's links.
 */
export {getInternalLinks, renameTargets, rewriteLinks} from '#shared/utils/index/rewriteLinks'
