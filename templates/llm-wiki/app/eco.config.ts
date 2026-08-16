import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { compareWikiEntries, wikiFrontmatterSchema } from './src/content/wiki';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { mdxPluginOptions } from './src/lib/mdx-plugin-options';
import { obsidianIngestPlugin } from './src/lib/obsidian';
import { LLM_WIKI_ORIGIN } from './src/lib/site-origin';

/**
 * Resolves the Ecopages app root for both source loads and the production
 * server bundle (`dist/.server/app.mjs`), where `import.meta.dirname` is the
 * bundle directory rather than this config file's location.
 */
function resolveAppRoot(): string {
	const dir = path.resolve(import.meta.dirname);
	const serverBundleDir = `${path.sep}dist${path.sep}.server`;
	if (dir.endsWith(serverBundleDir)) {
		return path.resolve(dir, '../..');
	}
	return dir;
}

const appRoot = resolveAppRoot();

const config = await new ConfigBuilder()
	.setRootDir(appRoot)
	.setBaseUrl(LLM_WIKI_ORIGIN)
	.setIntegrations([
		ecopagesJsxPlugin({
			extensions: ['.tsx'],
			mdx: mdxPluginOptions,
		}),
	])
	.setAdditionalWatchPaths(['src/lib', 'src/layouts/docs-layout'])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
		),
		obsidianIngestPlugin(),
		contentProcessorPlugin({
			options: {
				collections: {
					wiki: {
						contentDir: 'content/wiki',
						schema: wikiFrontmatterSchema,
						orderBy: compareWikiEntries,
						entryType: './src/content/wiki#WikiFrontmatter',
					},
				},
			},
		}),
	])
	.setDefaultMetadata({
		title: 'LLM Wiki',
		description: 'A persistent, LLM-maintained knowledge base',
		image: '/favicon/favicon.svg',
	})
	.build();

export default config;
