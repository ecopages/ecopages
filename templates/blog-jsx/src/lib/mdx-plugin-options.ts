import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: blogMdxPluginOptions })`. */
export const blogMdxPluginOptions = {
	enabled: true as const,
	...withContentMdxPlugins(),
};
