import remarkFrontmatter from 'remark-frontmatter';
import type { PluggableList } from 'unified';

export { default as remarkFrontmatter } from 'remark-frontmatter';

export type ContentMdxPluginsOptions = {
	/** Remark plugins appended after `remark-frontmatter`. */
	remarkPlugins?: PluggableList;
	/** Rehype plugins for the MDX pipeline. */
	rehypePlugins?: PluggableList;
};

export type ContentMdxPlugins = {
	remarkPlugins: PluggableList;
	rehypePlugins: PluggableList;
};

/**
 * Builds MDX plugin options for content collections that use YAML frontmatter.
 *
 * Prepends `remark-frontmatter` so `---` blocks are consumed at compile time
 * instead of rendering as thematic breaks. Pair this with
 * `contentProcessorPlugin()` — the processor validates frontmatter at scan time;
 * this helper wires the matching MDX remark plugin for render time.
 */
export function withContentMdxPlugins(options: ContentMdxPluginsOptions = {}): ContentMdxPlugins {
	return {
		remarkPlugins: [remarkFrontmatter, ...(options.remarkPlugins ?? [])],
		rehypePlugins: options.rehypePlugins ?? [],
	};
}
