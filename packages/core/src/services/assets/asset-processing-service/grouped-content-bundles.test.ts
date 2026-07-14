import { describe, expect, test } from 'vitest';
import {
	ensureGroupedContentScriptsBundle,
	partitionGroupedContentScriptDependencies,
} from './grouped-content-bundles.ts';
import type { AssetDefinition, ContentScriptAsset } from './assets.types.ts';

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
});
