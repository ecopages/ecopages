import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const persistLayouts = import.meta.env.ECOPAGES_PERSIST_LAYOUTS === 'true';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		reactPlugin({
			router: ecoRouter({ persistLayouts }),
			mdx: { enabled: true },
		}),
	])
	.setIncludesTemplates({
		head: 'head.tsx',
		html: 'html.tsx',
		seo: 'seo.tsx',
	})
	.setError404Template('404.tsx')
	.build();

export default config;
