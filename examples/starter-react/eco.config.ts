import { ConfigBuilder } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([reactPlugin()])
	.setProcessors([postcssProcessorPlugin()])
	.setError404Template('404.tsx')
	.setIncludesTemplates({
		head: 'head.tsx',
		html: 'html.tsx',
		seo: 'seo.tsx',
	})
	.build();

export default config;
