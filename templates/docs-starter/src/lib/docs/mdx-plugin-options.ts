import type { PluggableList } from 'unified';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';
import { rehypeHeadingIds } from './rehype-heading-ids';
import { rehypePierreCode } from './rehype-pierre-code';

export type DocsMdxPluginsOptions = {
	remarkPlugins?: PluggableList;
	rehypePlugins?: PluggableList;
};

/**
 * Docs MDX plugins layered on top of the content-collection defaults.
 *
 * @remarks
 * The built-in rehype order matters: heading ids first (so fragment links resolve before any script runs),
 * then the Pierre highlighter, which turns every fence, labelled or not, into a figure with a copy button.
 * Extra plugins run after them.
 */
export function createDocsMdxPlugins(options: DocsMdxPluginsOptions = {}) {
	return withContentMdxPlugins({
		remarkPlugins: [remarkGfm, ...(options.remarkPlugins ?? [])],
		rehypePlugins: [rehypeHeadingIds, rehypePierreCode, ...(options.rehypePlugins ?? [])],
	});
}

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: docsMdxPluginOptions })`. */
export const docsMdxPluginOptions = createDocsMdxPlugins();
