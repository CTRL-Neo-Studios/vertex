import type {InjectionKey, Ref} from "vue";
import frontmatter from "comark/plugins/frontmatter";
import linkify from "comark/plugins/linkify";
import security from "comark/plugins/security";
import taskList from "comark/plugins/task-list";

/** The tags Markdown itself makes. `security` drops any other, whatever a later Comark starts to make. */
const MARKDOWN_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'ul', 'ol', 'li', 'input', 'blockquote', 'pre', 'code',
    'em', 'strong', 'del', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'br']

/**
 * How someone else's Markdown is parsed (a plugin's README, `MarkdownText`): Comark without its default plugins, so
 * raw HTML (`html`), Vue components by name (`components`) and attributes such as `{onclick=…}` (`attributes`) stay
 * text; a frontmatter block is hidden, task lists and bare links work. No heading ids: their anchors would route the
 * window.
 */
export const strangerMarkdown = {
    options: {registerDefaultPlugins: false, headingIds: false},
    plugins: [frontmatter(), linkify(), taskList(), security({allowedTags: MARKDOWN_TAGS})],
} as const

/** What `MarkdownText` gives its images: whether remote ones may load, and a relative one's URL (none: not drawn). */
export const MARKDOWN_IMAGES: InjectionKey<{ remote: Ref<boolean>, asset: (path: string) => string | undefined }> = Symbol('markdown-images')