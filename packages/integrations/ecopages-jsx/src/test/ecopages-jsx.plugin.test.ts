import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'vitest';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { EcopagesJsxPlugin } from '../ecopages-jsx.plugin.ts';

function getMdxLoaderFilter(plugin: EcoBuildPlugin): RegExp {
	let capturedFilter: RegExp | undefined;

	plugin.setup({
		onLoad(options) {
			capturedFilter = options.filter;
		},
		onResolve() {},
		module() {},
	});

	assert.ok(capturedFilter, 'Expected MDX loader plugin to register an onLoad filter.');
	return capturedFilter;
}

test('EcopagesJsxPlugin matches custom multi-dot MDX extensions exactly', async () => {
	const plugin = new EcopagesJsxPlugin({
		radiant: false,
		mdx: {
			enabled: true,
			extensions: ['.story.mdx'],
		},
	});

	await plugin.prepareBuildContributions();

	const mdxLoaderPlugin = plugin.plugins[0];
	assert.ok(mdxLoaderPlugin, 'Expected Ecopages JSX plugin to expose the MDX loader plugin.');

	const filter = getMdxLoaderFilter(mdxLoaderPlugin);

	assert.equal(filter.test('/tmp/src/pages/component.story.mdx'), true);
	assert.equal(filter.test('/tmp/src/pages/component.story.mdx?import'), true);
	assert.equal(filter.test('/tmp/src/pages/componentXstory.mdx'), false);
	assert.equal(filter.test('/tmp/src/pages/component-story-mdx'), false);
});

test('EcopagesJsxPlugin only processes scripts that declare custom elements', async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), 'ecopages-jsx-plugin-'));
	const plainScriptPath = path.join(tempDir, 'plain.script.ts');
	const customElementScriptPath = path.join(tempDir, 'counter.script.ts');

	try {
		await writeFile(plainScriptPath, 'export const noop = true;');
		await writeFile(
			customElementScriptPath,
			"import { customElement } from '@ecopages/radiant/decorators/custom-element';\n@customElement('radiant-counter')\nexport class RadiantCounter {}\n",
		);

		const plugin = new EcopagesJsxPlugin({ radiant: false });
		const processDependencies = async () => [
			{
				kind: 'script',
				srcUrl: '/assets/radiant-counter.js',
				position: 'head',
			},
		];

		(
			plugin as EcopagesJsxPlugin & {
				appConfig: { absolutePaths: { srcDir: string } };
				assetProcessingService: { processDependencies: typeof processDependencies };
				buildIntrinsicCustomElementAssetRegistry(): Promise<void>;
				intrinsicCustomElementAssets: Map<string, Array<{ srcUrl: string }>>;
			}
		).appConfig = {
			absolutePaths: {
				srcDir: tempDir,
			},
		};
		(
			plugin as EcopagesJsxPlugin & {
				assetProcessingService: { processDependencies: typeof processDependencies };
			}
		).assetProcessingService = {
			processDependencies,
		};

		let processedPath: string | undefined;
		(
			plugin as EcopagesJsxPlugin & {
				resolveIntrinsicCustomElementAsset(scriptFile: string): Promise<{ srcUrl: string } | undefined>;
			}
		).resolveIntrinsicCustomElementAsset = async (scriptFile: string) => {
			processedPath = scriptFile;
			return {
				srcUrl: '/assets/radiant-counter.js',
			};
		};

		await (
			plugin as EcopagesJsxPlugin & {
				buildIntrinsicCustomElementAssetRegistry(): Promise<void>;
			}
		).buildIntrinsicCustomElementAssetRegistry();

		assert.equal(processedPath, customElementScriptPath);
		assert.deepEqual(
			(
				plugin as EcopagesJsxPlugin & {
					intrinsicCustomElementAssets: Map<string, Array<{ srcUrl: string }>>;
				}
			).intrinsicCustomElementAssets.get('radiant-counter'),
			[{ srcUrl: '/assets/radiant-counter.js' }],
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
