import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		reactPlugin({ router: ecoRouter() }),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: 'react',
			},
		}),
	])
	.setIncludesTemplates({
		head: 'head.tsx',
		html: 'html.tsx',
		seo: 'seo.tsx',
	})
	.build();

export default config;
