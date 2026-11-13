import type { PluggableList } from 'unified';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import { transformerCopyButton } from '@rehype-pretty/transformers';
import remarkGfm from 'remark-gfm';
import rehypePrettyCode from 'rehype-pretty-code';
import { rehypeHeadingIds } from './rehype-heading-ids';
import { rehypePrettyCopyCompatibility } from './rehype-pretty-copy-compatibility';
import { DOCS_SHIKI_THEMES } from './shiki-themes';

export type DocsMdxPluginsOptions = {
	remarkPlugins?: PluggableList;
	rehypePlugins?: PluggableList;
};

/**
 * Docs MDX plugins layered on top of the content-collection defaults.
 *
 * @remarks
 * The built-in rehype order matters: heading ids first (so fragment links resolve before any script runs),
 * then rehype-pretty-code, then the copy-button compatibility pass. Extra plugins run after them.
 * `defaultLang` gives unlabelled fences a figure, and therefore a copy button.
 */
export function createDocsMdxPlugins(options: DocsMdxPluginsOptions = {}) {
	return withContentMdxPlugins({
		remarkPlugins: [remarkGfm, ...(options.remarkPlugins ?? [])],
		rehypePlugins: [
			rehypeHeadingIds,
			[
				rehypePrettyCode,
				{
					theme: DOCS_SHIKI_THEMES,
					defaultLang: { block: 'text' },
					transformers: [transformerCopyButton()],
				},
			],
			rehypePrettyCopyCompatibility,
			...(options.rehypePlugins ?? []),
		],
	});
}

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: docsMdxPluginOptions })`. */
export const docsMdxPluginOptions = createDocsMdxPlugins();
