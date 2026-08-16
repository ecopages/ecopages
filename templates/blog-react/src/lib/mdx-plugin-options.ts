import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';

/** MDX plugin options wired into `reactPlugin({ mdx: blogMdxPluginOptions })`. */
export const blogMdxPluginOptions = {
	enabled: true as const,
	...withContentMdxPlugins(),
};
