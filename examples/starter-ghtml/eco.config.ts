import { ConfigBuilder, ghtmlPlugin } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV3Preset } from '@ecopages/postcss-processor/presets/tailwind-v3';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setProcessors([postcssProcessorPlugin(tailwindV3Preset())])
	.setIntegrations([
		ghtmlPlugin({
			extensions: ['.ts'],
		}),
	])
	.setError404Template('404.ts')
	.setIncludesTemplates({
		head: 'head.ts',
		html: 'html.ts',
		seo: 'seo.ts',
	})
	.build();

export default config;
