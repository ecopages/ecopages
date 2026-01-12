import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

export default await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL ?? '/')
	.setIntegrations([kitajsPlugin(), litPlugin()])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dir, 'src/styles/global.css'),
			}),
		),
	])
	.setIncludesTemplates({
		head: 'head.kita.tsx',
		html: 'html.kita.tsx',
		seo: 'seo.kita.tsx',
	})
	.build();
