import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		kitajsPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	])
	.setIncludesTemplates({
		head: 'head.kita.tsx',
		html: 'html.kita.tsx',
		seo: 'seo.kita.tsx',
	})
	.build();

export default config;
