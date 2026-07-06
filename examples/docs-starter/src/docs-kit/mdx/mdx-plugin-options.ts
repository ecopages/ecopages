import remarkGfm from 'remark-gfm';

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: getDocsMdxPluginOptions() })`. */
export function getDocsMdxPluginOptions() {
	return {
		enabled: true as const,
		remarkPlugins: [remarkGfm],
	};
}
