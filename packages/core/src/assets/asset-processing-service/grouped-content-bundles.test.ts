import { describe, expect, test, vi } from 'vitest';
import {
	ensureGroupedContentScriptsBundle,
	partitionGroupedContentScriptDependencies,
} from './grouped-content-bundles.ts';
import type { AssetDefinition, ContentScriptAsset } from './assets.types.ts';

describe('grouped-content-bundles', () => {
	test('ensureGroupedContentScriptsBundle enables bundling for grouped scripts in production', () => {
		vi.stubEnv('NODE_ENV', 'production');

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
	});

	test('ensureGroupedContentScriptsBundle leaves grouped scripts unbundled in development', () => {
		vi.stubEnv('NODE_ENV', 'development');

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
	});

	test('partitionGroupedContentScriptDependencies routes grouped scripts together', () => {
		const bundleId = 'ecopages-app-browser-client';
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
				filepath: '/app/island.tsx',
				groupedBundle: { id: bundleId, entryName: 'island-a' },
			},
			{
				kind: 'script',
				source: 'file',
				filepath: '/app/eager.ts',
			},
		];

		const { groupedBundleDeps, ungroupedDeps } = partitionGroupedContentScriptDependencies(dependencies);

		expect(Array.from(groupedBundleDeps.values())).toEqual([dependencies.slice(0, 3)]);
		expect(ungroupedDeps).toEqual([dependencies[3]]);
	});
});
