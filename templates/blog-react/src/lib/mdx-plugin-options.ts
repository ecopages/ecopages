import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import remarkGfm from 'remark-gfm';

/** MDX plugin options wired into `reactPlugin({ mdx: blogMdxPluginOptions })`. */
export const blogMdxPluginOptions = {
	...withContentMdxPlugins({
		remarkPlugins: [remarkGfm],
	}),
};
