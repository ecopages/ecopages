import path from 'node:path';
import { ConfigBuilder, ghtmlPlugin } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dir, 'src/styles/tailwind.css'),
			}),
		),
	])
	.setIntegrations([
		ghtmlPlugin({
			extensions: ['.ts'],
		}),
	])
	.setError404Template('404.ts')
	.setIncludesTemplates({
		head: 'head.ghtml.ts',
		html: 'html.ghtml.ts',
		seo: 'seo.ghtml.ts',
	})
	.build();

export default config;
