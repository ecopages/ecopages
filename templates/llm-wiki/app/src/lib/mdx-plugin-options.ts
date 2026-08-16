import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';
import { remarkWikiLinks } from './wiki/remark-links';

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: mdxPluginOptions })`. */
export const mdxPluginOptions = {
	enabled: true as const,
	...withContentMdxPlugins({
		remarkPlugins: [remarkGfm, remarkWikiLinks],
	}),
};
