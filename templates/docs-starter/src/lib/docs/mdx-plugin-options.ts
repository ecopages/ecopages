import type { Pluggable } from 'unified';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import { transformerCopyButton } from '@rehype-pretty/transformers';
import remarkGfm from 'remark-gfm';
import rehypePrettyCode from 'rehype-pretty-code';
import { rehypePrettyCopyCompatibility } from './rehype-pretty-copy-compatibility';

const rehypePlugins = [
	[
		rehypePrettyCode,
		{
			theme: {
				light: 'light-plus',
				dark: 'dark-plus',
			},
			transformers: [transformerCopyButton()],
		},
	],
	rehypePrettyCopyCompatibility,
] satisfies Pluggable[];

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: docsMdxPluginOptions })`. */
export const docsMdxPluginOptions = {
	enabled: true as const,
	...withContentMdxPlugins({
		remarkPlugins: [remarkGfm],
		rehypePlugins,
	}),
};
