import type { Pluggable } from 'unified';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';
import rehypePrettyCode from 'rehype-pretty-code';
import { rehypeSimpleTableWrapper } from '@/lib/plugins/rehype-simple-table-wrapper';
import { remarkEscapeInlineCodeHtml } from '@/lib/plugins/remark-escape-inline-code-html';

const rehypePlugins = [
	[
		rehypePrettyCode,
		{
			theme: {
				light: 'light-plus',
				dark: 'dark-plus',
			},
		},
	],
	rehypeSimpleTableWrapper,
] satisfies Pluggable[];

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: getDocsMdxPluginOptions() })`. */
export function getDocsMdxPluginOptions() {
	return {
		enabled: true as const,
		...withContentMdxPlugins({
			remarkPlugins: [remarkGfm, remarkEscapeInlineCodeHtml],
			rehypePlugins,
		}),
	};
}
