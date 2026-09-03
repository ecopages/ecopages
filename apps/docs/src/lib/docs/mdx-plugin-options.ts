import type { Pluggable } from 'unified';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';
import rehypePrettyCode from 'rehype-pretty-code';

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
] satisfies Pluggable[];

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: docsMdxPluginOptions })`. */
export const docsMdxPluginOptions = {
	enabled: true as const,
	...withContentMdxPlugins({
		remarkPlugins: [remarkGfm],
		rehypePlugins,
	}),
};
