import assert from 'node:assert/strict';
import { describe, expect, test } from 'vitest';
import type { AssetDefinition, ContentScriptAsset } from '@ecopages/core/services/asset-processing-service';
import {
	assignPageOwnedContentScriptGroupedBundles,
	createPageOwnedContentScriptBundleId,
} from './page-owned-content-script-grouping.ts';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';

describe('page-owned-content-script-grouping', () => {
	test('assignPageOwnedContentScriptGroupedBundles groups ecopages-jsx page-owned scripts', () => {
		const dependencies: AssetDefinition[] = [
			{
				kind: 'script',
				source: 'content',
				name: 'module-ecopages-images',
				content: 'import "ecopages:images";',
				bundle: false,
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

		assignPageOwnedContentScriptGroupedBundles(dependencies);

		const moduleScript = dependencies[0] as ContentScriptAsset;
		const lazyScript = dependencies[1] as ContentScriptAsset;
		const fileScript = dependencies[2] as AssetDefinition;
		const injectorScript = dependencies[3] as ContentScriptAsset;

		expect(moduleScript.groupedBundle).toEqual({
			id: createPageOwnedContentScriptBundleId(ECOPAGES_JSX_PLUGIN_NAME),
			entryName: 'module-ecopages-images',
		});
		expect(moduleScript.bundle).toBe(true);
		expect(lazyScript.groupedBundle).toBeUndefined();
		expect(fileScript).not.toHaveProperty('groupedBundle');
		expect(injectorScript.groupedBundle).toBeUndefined();
	});

	test('assignPageOwnedContentScriptGroupedBundles leaves pre-assigned grouped ids unchanged', () => {
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

		assignPageOwnedContentScriptGroupedBundles(dependencies);

		assert.equal((dependencies[0] as ContentScriptAsset).groupedBundle?.id, 'ecopages-react-router-pages');
	});
});
