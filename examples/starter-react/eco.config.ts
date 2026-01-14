import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		reactPlugin({
			router: ecoRouter(),
		}),
	])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dir, 'src/styles/tailwind.css'),
			}),
		),
	])
	.setError404Template('404.tsx')
	.setIncludesTemplates({
		head: 'head.tsx',
		html: 'html.tsx',
		seo: 'seo.tsx',
	})
	.build();

export default config;
