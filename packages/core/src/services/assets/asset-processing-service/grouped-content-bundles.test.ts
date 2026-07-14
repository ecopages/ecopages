import { describe, expect, test } from 'vitest';
import {
	assignPageOwnedContentScriptGroupedBundles,
	createPageOwnedContentScriptBundleId,
	ensureGroupedContentScriptsBundle,
	partitionGroupedContentScriptDependencies,
	resolveGroupingIntegrationName,
} from './grouped-content-bundles.ts';
import type { AssetDefinition, ContentScriptAsset } from './assets.types.ts';

describe('grouped-content-bundles', () => {
	test('assignPageOwnedContentScriptGroupedBundles groups ecopages-jsx page-owned scripts', () => {
		const dependencies: AssetDefinition[] = [
			{
				kind: 'script',
				source: 'content',
				name: 'module-ecopages-images',
				content: 'import "ecopages:images";',
			},
			{
				kind: 'script',
				source: 'content',
				name: 'ecopages-ecopages-jsx-lazy-deadbeef',
				content: 'import "/app/theme-toggle.script.ts";',
				excludeFromHtml: true,
				bundleOptions: { splitting: false },
			},
			{
				kind: 'script',
				source: 'file',
				filepath: '/app/theme-toggle.script.ts',
				packageRole: 'dynamic-chunk',
			},
			{
				kind: 'script',
				source: 'content',
				name: 'ecopages-global-injector-bootstrap',
				content: 'import "@ecopages/scripts-injector/global";',
				packageRole: 'keep-separate',
			},
		];

		assignPageOwnedContentScriptGroupedBundles(dependencies, 'ecopages-jsx');

		const moduleScript = dependencies[0] as ContentScriptAsset;
		const lazyScript = dependencies[1] as ContentScriptAsset;
		const fileScript = dependencies[2] as AssetDefinition;
		const injectorScript = dependencies[3] as ContentScriptAsset;

		expect(moduleScript.groupedBundle).toEqual({
			id: createPageOwnedContentScriptBundleId('ecopages-jsx'),
			entryName: 'module-ecopages-images',
		});
		expect(lazyScript.groupedBundle).toEqual({
			id: createPageOwnedContentScriptBundleId('ecopages-jsx'),
			entryName: 'ecopages-ecopages-jsx-lazy-deadbeef',
		});
		expect(fileScript).not.toHaveProperty('groupedBundle');
		expect(injectorScript.groupedBundle).toBeUndefined();
	});

	test('assignPageOwnedContentScriptGroupedBundles leaves react router grouped ids unchanged', () => {
		const dependencies: AssetDefinition[] = [
			{
				kind: 'script',
				source: 'content',
				name: 'page-entry',
				content: 'import "/app/pages/index.tsx";',
				packageRole: 'page-script',
				groupedBundle: {
					id: 'ecopages-react-router-pages',
					entryName: 'pages__index',
				},
			},
		];

		assignPageOwnedContentScriptGroupedBundles(dependencies, 'react');

		expect((dependencies[0] as ContentScriptAsset).groupedBundle?.id).toBe('ecopages-react-router-pages');
	});

	test('ensureGroupedContentScriptsBundle enables bundling for grouped scripts in development', () => {
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

	test('partitionGroupedContentScriptDependencies routes grouped scripts together', () => {
		const bundleId = createPageOwnedContentScriptBundleId('ecopages-jsx');
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

	test('resolveGroupingIntegrationName recognizes integration processing keys', () => {
		expect(resolveGroupingIntegrationName('ecopages-jsx')).toBe('ecopages-jsx');
		expect(resolveGroupingIntegrationName('ecopages-jsx:ssr-lazy')).toBe('ecopages-jsx');
		expect(resolveGroupingIntegrationName('ecopages-react-123456')).toBe('react');
	});
});
