import type { Pluggable } from 'unified';
import { resolveFunctionBodyCompileOptions } from '@ecopages/mdx/core';
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

export function getDocsMdxPluginOptions() {
	return {
		enabled: true as const,
		remarkPlugins: [remarkGfm, remarkEscapeInlineCodeHtml],
		rehypePlugins,
	};
}

/** MDX options shared by `eco.config.ts` and the docs content compile path. */
export function getDocsMdxCompileOptions() {
	return resolveFunctionBodyCompileOptions(getDocsMdxPluginOptions(), {
		jsxImportSource: '@ecopages/jsx',
		defaults: {
			format: 'detect',
			outputFormat: 'program',
		},
	});
}
