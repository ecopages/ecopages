import { resolveFunctionBodyCompileOptions } from '@ecopages/mdx/core';
import remarkGfm from 'remark-gfm';

export function getDocsMdxPluginOptions() {
	return {
		enabled: true as const,
		remarkPlugins: [remarkGfm],
	};
}

export function getDocsMdxCompileOptions() {
	return resolveFunctionBodyCompileOptions(getDocsMdxPluginOptions(), {
		jsxImportSource: '@ecopages/jsx',
		defaults: {
			format: 'detect',
			outputFormat: 'program',
		},
	});
}
