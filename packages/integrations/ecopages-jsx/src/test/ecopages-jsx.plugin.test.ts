import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test, vi } from 'vitest';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { EcopagesJsxPlugin, ecopagesJsxPlugin } from '../ecopages-jsx.plugin.ts';

type PluginTestInternals = {
	appConfig: { absolutePaths: { srcDir: string } };
	assetProcessingService: {
		processDependencies: (dependencies: unknown[], key: string) => Promise<unknown[]>;
	};
	buildCustomElementRegistry(): Promise<void>;
	resolveCustomElementAsset(scriptFile: string): Promise<unknown>;
	customElementAssets: Map<string, Array<{ srcUrl: string }>>;
};

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
	const plugin = ecopagesJsxPlugin({
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

test('EcopagesJsxPlugin supports direct construction with default public options', () => {
	const plugin = new EcopagesJsxPlugin();

	assert.deepEqual(plugin.extensions, ['.tsx']);
});

test('EcopagesJsxPlugin supports direct construction with MDX public options', () => {
	const plugin = new EcopagesJsxPlugin({
		extensions: ['.eco.tsx'],
		mdx: {
			enabled: true,
			extensions: ['.guide.mdx'],
		},
	});

	assert.deepEqual(plugin.extensions, ['.eco.tsx', '.guide.mdx']);
	assert.deepEqual((plugin as any).mdxExtensions, ['.guide.mdx']);
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

		const plugin = ecopagesJsxPlugin({ radiant: false });
		const pluginInternals = plugin as unknown as PluginTestInternals;
		const processDependencies = async (_dependencies: unknown[], _key: string) => [
			{
				kind: 'script' as const,
				srcUrl: '/assets/radiant-counter.js',
				position: 'head' as const,
			},
		];

		pluginInternals.appConfig = {
			absolutePaths: {
				srcDir: tempDir,
			},
		};
		pluginInternals.assetProcessingService = {
			processDependencies,
		};

		let processedPath: string | undefined;
		pluginInternals.resolveCustomElementAsset = async (scriptFile: string) => {
			processedPath = scriptFile;
			return {
				srcUrl: '/assets/radiant-counter.js',
			};
		};

		await pluginInternals.buildCustomElementRegistry();

		assert.equal(processedPath, customElementScriptPath);
		assert.deepEqual(pluginInternals.customElementAssets.get('radiant-counter'), [
			{ srcUrl: '/assets/radiant-counter.js' },
		]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test('EcopagesJsxPlugin processes scripts that register custom elements with function-call syntax', async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), 'ecopages-jsx-plugin-'));
	const customElementScriptPath = path.join(tempDir, 'counter.script.ts');

	try {
		await writeFile(
			customElementScriptPath,
			[
				"import { customElement } from '@ecopages/radiant/decorators/custom-element';",
				'class RadiantCounter {}',
				"customElement('radiant-counter')(RadiantCounter);",
			].join('\n'),
		);

		const plugin = ecopagesJsxPlugin({ radiant: false });
		const pluginInternals = plugin as unknown as PluginTestInternals;

		pluginInternals.appConfig = {
			absolutePaths: {
				srcDir: tempDir,
			},
		};
		pluginInternals.assetProcessingService = {
			processDependencies: async (_dependencies: unknown[], _key: string) => [],
		};

		let processedPath: string | undefined;
		pluginInternals.resolveCustomElementAsset = async (scriptFile: string) => {
			processedPath = scriptFile;
			return {
				srcUrl: '/assets/radiant-counter.js',
			};
		};

		await pluginInternals.buildCustomElementRegistry();

		assert.equal(processedPath, customElementScriptPath);
		assert.deepEqual(pluginInternals.customElementAssets.get('radiant-counter'), [
			{ srcUrl: '/assets/radiant-counter.js' },
		]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test('EcopagesJsxPlugin registers intrinsic custom element scripts as module entrypoints', async () => {
	const plugin = ecopagesJsxPlugin({ radiant: true });
	const pluginInternals = plugin as unknown as PluginTestInternals;
	const processDependencies = vi.fn(async (dependencies: unknown[], _key: string) =>
		dependencies.map(() => ({
			kind: 'script' as const,
			srcUrl: '/assets/theme-toggle.script.js',
			position: 'head' as const,
			attributes: {
				type: 'module',
				defer: '',
			},
		})),
	);

	pluginInternals.assetProcessingService = {
		processDependencies,
	};

	await pluginInternals.resolveCustomElementAsset('/tmp/theme-toggle.script.ts');

	assert.equal(processDependencies.mock.calls.length, 1);
	assert.deepEqual(processDependencies.mock.calls[0]?.[0], [
		{
			kind: 'script',
			source: 'file',
			filepath: '/tmp/theme-toggle.script.ts',
			position: 'head',
			attributes: {
				type: 'module',
				defer: '',
			},
		},
	]);
	assert.equal(
		processDependencies.mock.calls[0]?.[1],
		'ecopages-jsx:custom-elements:/tmp/theme-toggle.script.ts',
	);
});
