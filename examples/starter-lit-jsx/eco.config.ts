import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const referencePath = path.resolve(import.meta.dir, 'src/styles/tailwind.css');
const preset = tailwindV4Preset({ referencePath });

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		kitajsPlugin(),
		litPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	])
	.setProcessors([
		postcssProcessorPlugin({
			...preset,
			transformInput: async (contents, filePath) => {
				const css = contents instanceof Buffer ? contents.toString('utf-8') : (contents as string);

				if (css.includes("@import 'tailwindcss/") || css.includes('@import "tailwindcss/')) {
					return css;
				}

				if (preset.transformInput) {
					return preset.transformInput(contents, filePath);
				}

				return css;
			},
		}),
	])
	.setIncludesTemplates({
		head: 'head.kita.tsx',
		html: 'html.kita.tsx',
		seo: 'seo.kita.tsx',
	})
	.setError404Template('404.kita.tsx')
	.build();

export default config;
