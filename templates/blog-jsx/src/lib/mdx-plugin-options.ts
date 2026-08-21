import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: blogMdxPluginOptions })`. */
export const blogMdxPluginOptions = {
	enabled: true as const,
	...withContentMdxPlugins({
		remarkPlugins: [remarkGfm],
	}),
};
