import { describe, expect, it, test } from 'vitest';
import { getAssetDependencyKey } from './asset-dependency-keys.ts';
import { AssetFactory } from './asset.factory.ts';
import type { ContentScriptAsset } from './assets.types.ts';

function createContentScript(overrides: Partial<ContentScriptAsset> = {}): ContentScriptAsset {
	return {
		kind: 'script',
		source: 'content',
		content: 'import "/test/project/src/page.ts";',
		position: 'head',
		attributes: { type: 'module', defer: '' },
		packageRole: 'page-script',
		...overrides,
	};
}

describe('getAssetDependencyKey', () => {
	it('keeps stylesheet declarations of the same file with different attributes apart', () => {
		const filepath = '/app/src/site.css';

		expect(
			getAssetDependencyKey(AssetFactory.createFileStylesheet({ filepath, attributes: { media: 'print' } })),
		).not.toBe(
			getAssetDependencyKey(AssetFactory.createFileStylesheet({ filepath, attributes: { media: 'screen' } })),
		);
	});

	it('keeps a classic and a module declaration of the same file apart', () => {
		const filepath = '/app/src/pages/greeting.ts';

		expect(getAssetDependencyKey(AssetFactory.createFileScript({ filepath, classic: true }))).not.toBe(
			getAssetDependencyKey(AssetFactory.createFileScript({ filepath })),
		);
	});

	describe('content scripts', () => {
		const base = createContentScript();

		test.each<[string, Partial<ContentScriptAsset>]>([
			['bundleOptions.minify', { bundleOptions: { minify: true } }],
			[
				'HTML attributes',
				{ attributes: { type: 'module', defer: '', 'data-eco-page-bootstrap': 'react-router' } },
			],
			['missing attributes', { attributes: undefined }],
			['groupedBundle', { groupedBundle: { id: 'bundle-1', entryName: 'page-entry' } }],
		])('a different %s changes the key', (_name, overrides) => {
			expect(getAssetDependencyKey(createContentScript(overrides))).not.toBe(getAssetDependencyKey(base));
		});

		it('is stable for duplicate declarations with the same build signature', () => {
			const bundleOptions = { naming: '[name]-[hash].[ext]', external: ['react'] };

			expect(getAssetDependencyKey(createContentScript({ bundleOptions }))).toBe(
				getAssetDependencyKey(createContentScript({ bundleOptions: { ...bundleOptions } })),
			);
		});
	});
});
