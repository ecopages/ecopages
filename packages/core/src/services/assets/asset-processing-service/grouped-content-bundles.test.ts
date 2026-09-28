import { describe, expect, test, vi } from 'vitest';
import {
	ensureGroupedContentScriptsBundle,
	partitionGroupedContentScriptDependencies,
	processGroupedDependencyBundles,
} from './grouped-content-bundles.ts';
import type { AssetDefinition, ContentScriptAsset, ProcessedAsset } from './assets.types.ts';

describe('grouped-content-bundles', () => {
	test('ensureGroupedContentScriptsBundle enables bundling for grouped scripts in production', () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';

		const dependency: ContentScriptAsset = {
			kind: 'script',
			source: 'content',
			content: 'console.log("hydrate");',
			bundle: false,
			groupedBundle: {
				id: 'ecopages-react-router-pages',
				entryName: 'pages__index',
			},
		};

		ensureGroupedContentScriptsBundle([dependency]);

		expect(dependency.bundle).toBe(true);

		process.env.NODE_ENV = previousNodeEnv;
	});

	test('ensureGroupedContentScriptsBundle leaves grouped scripts unbundled in development', () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';

		const dependency: ContentScriptAsset = {
			kind: 'script',
			source: 'content',
			content: 'console.log("hydrate");',
			bundle: false,
			groupedBundle: {
				id: 'ecopages-react-router-pages',
				entryName: 'pages__index',
			},
		};

		ensureGroupedContentScriptsBundle([dependency]);

		expect(dependency.bundle).toBe(false);

		process.env.NODE_ENV = previousNodeEnv;
	});

	test('partitionGroupedContentScriptDependencies routes grouped scripts together', () => {
		const bundleId = 'ecopages-ecopages-jsx-page-content-scripts';
		const dependencies: AssetDefinition[] = [
			{
				kind: 'script',
				source: 'content',
				content: 'import "ecopages:images";',
				groupedBundle: { id: bundleId, entryName: 'module-images' },
			},
			{
				kind: 'script',
				source: 'content',
				content: 'import "./lazy.ts";',
				groupedBundle: { id: bundleId, entryName: 'lazy-entry' },
			},
			{
				kind: 'script',
				source: 'file',
				filepath: '/app/lazy.ts',
			},
		];

		const { groupedBundleDeps, ungroupedDeps } = partitionGroupedContentScriptDependencies(dependencies);

		expect(Array.from(groupedBundleDeps.values())).toEqual([dependencies.slice(0, 2)]);
		expect(ungroupedDeps).toEqual([dependencies[2]]);
	});

	test('processGroupedDependencyBundles matches processor output by groupedBundle entry, not array index', async () => {
		const bundleId = 'bundle-1';
		const bundleDeps = [
			{
				kind: 'script' as const,
				source: 'content' as const,
				content: 'import "/page.js";',
				groupedBundle: { id: bundleId, entryName: 'page-entry' },
			},
			{
				kind: 'script' as const,
				source: 'content' as const,
				content: 'import "/lazy.js";',
				groupedBundle: { id: bundleId, entryName: 'lazy-entry' },
				excludeFromHtml: true,
			},
		];

		const results = await processGroupedDependencyBundles({
			bundles: [bundleDeps],
			getCachedAsset: () => null,
			getDependencyKey: (dep) => (dep.kind === 'script' && dep.source === 'content' ? dep.content : dep.kind),
			getGroupedProcessor: () => ({
				processGrouped: vi.fn(async (): Promise<ProcessedAsset[]> => [
					{
						filepath: '/test/dist/assets/lazy-entry.js',
						kind: 'script',
						inline: false,
						groupedBundle: { id: bundleId, entryName: 'lazy-entry' },
						excludeFromHtml: true,
					},
					{
						filepath: '/test/dist/assets/page-entry.js',
						kind: 'script',
						inline: false,
						groupedBundle: { id: bundleId, entryName: 'page-entry' },
					},
				]),
			}),
			resolveProcessedAssetSrcUrl: (processed) => processed.filepath?.replace('/test/dist', '') ?? undefined,
			setCachedAsset: vi.fn(),
			logError: vi.fn(),
		});

		expect(results.map((result) => result.filepath)).toEqual([
			'/test/dist/assets/page-entry.js',
			'/test/dist/assets/lazy-entry.js',
		]);
	});
});
