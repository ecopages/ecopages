import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { compareDocsEntries, docsFrontmatterSchema } from './src/content/docs';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { getDocsMdxPluginOptions } from './src/lib/docs/mdx-plugin-options';

const appRoot = path.resolve(import.meta.dirname);

const config = await new ConfigBuilder()
	.setRootDir(appRoot)
	.setBaseUrl(process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000')
	.setIntegrations([
		ecopagesJsxPlugin({
			extensions: ['.tsx'],
			mdx: getDocsMdxPluginOptions(),
		}),
	])
	.setAdditionalWatchPaths(['src/content', 'src/lib/docs', 'src/layouts/docs-layout'])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
		),
		contentProcessorPlugin({
			options: {
				collections: {
					docs: {
						contentDir: 'content/docs',
						schema: docsFrontmatterSchema,
						orderBy: compareDocsEntries,
						entryType: './src/content/docs#DocsFrontmatter',
					},
				},
			},
		}),
	])
	.build();

export default config;
