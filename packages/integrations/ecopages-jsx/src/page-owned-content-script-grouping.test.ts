import assert from 'node:assert/strict';
import { describe, expect, test } from 'vitest';
import type { AssetDefinition, ContentScriptAsset } from '@ecopages/core/integration';
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

		const prepared = assignPageOwnedContentScriptGroupedBundles(dependencies);

		const moduleScript = prepared[0] as ContentScriptAsset;
		const lazyScript = prepared[1] as ContentScriptAsset;
		const fileScript = prepared[2] as AssetDefinition;
		const injectorScript = prepared[3] as ContentScriptAsset;

		expect(moduleScript.groupedBundle).toEqual({
			id: createPageOwnedContentScriptBundleId(ECOPAGES_JSX_PLUGIN_NAME),
			entryName: expect.stringMatching(/^module-ecopages-images-[a-f0-9]{8}$/),
		});
		expect(moduleScript.bundle).toBe(true);
		expect(lazyScript.groupedBundle).toEqual({
			id: createPageOwnedContentScriptBundleId(ECOPAGES_JSX_PLUGIN_NAME),
			entryName: expect.stringMatching(/^ecopages-ecopages-jsx-lazy-deadbeef-[a-f0-9]{8}$/),
		});
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

		const [prepared] = assignPageOwnedContentScriptGroupedBundles(dependencies);

		assert.equal((prepared as ContentScriptAsset).groupedBundle?.id, 'ecopages-react-router-pages');
	});

	test('assignPageOwnedContentScriptGroupedBundles names a generated script by its own name, whatever its text', () => {
		const generated = (root: string): ContentScriptAsset => ({
			kind: 'script',
			source: 'content',
			name: 'ecopages-jsx-page-abc',
			content: `import "${root}/src/a.script.ts";`,
			bundledSourceFilepaths: [`${root}/src/a.script.ts`],
		});

		const [first] = assignPageOwnedContentScriptGroupedBundles([generated('/builds/one/app')]);
		const [second] = assignPageOwnedContentScriptGroupedBundles([generated('/srv/two/app')]);

		expect((first as ContentScriptAsset).groupedBundle?.entryName).toBe('ecopages-jsx-page-abc');
		expect((second as ContentScriptAsset).groupedBundle?.entryName).toBe('ecopages-jsx-page-abc');
	});

	test('assignPageOwnedContentScriptGroupedBundles names a script the same in any batch, without changing it', () => {
		const script: ContentScriptAsset = {
			kind: 'script',
			source: 'content',
			name: 'page-entry',
			content: 'import "/app/pages/a.tsx";',
		};
		const namesake: ContentScriptAsset = { ...script, content: 'import "/app/pages/b.tsx";' };

		const [alone] = assignPageOwnedContentScriptGroupedBundles([script]);
		const [, together] = assignPageOwnedContentScriptGroupedBundles([namesake, script]);

		expect(together).toEqual(alone);
		expect(script.groupedBundle).toBeUndefined();
	});
});
