import { expect, test } from 'vitest';
import type { ProcessedAsset } from './asset-processing-service/index.ts';
import { dedupeProcessedAssets } from './processed-asset-dedupe.ts';

test('keeps identical bundled assets with different source files in declaration order', () => {
	const createBundle = (bundledSourceFilepaths: string[]): ProcessedAsset => ({
		filepath: '/assets/shared.css',
		srcUrl: '/assets/shared.css',
		kind: 'stylesheet',
		position: 'head',
		inline: false,
		packageRole: 'page-style',
		attributes: { rel: 'stylesheet' },
		bundledSourceFilepaths,
	});
	const first = createBundle(['/app/a.css', '/app/b.css']);
	const second = createBundle(['/app/d.css', '/app/e.css']);

	expect(dedupeProcessedAssets([first, second])).toEqual([first, second]);
});

test('drops repeated assets while keeping first-seen order', () => {
	const first = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
	const duplicate = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
	const second = { kind: 'stylesheet', srcUrl: '/assets/app.css', position: 'head' } as ProcessedAsset;

	expect(dedupeProcessedAssets([first, duplicate, second])).toEqual([first, second]);
});

test('keeps assets that differ only in package role', () => {
	const pageScript = {
		kind: 'script',
		srcUrl: '/assets/app.js',
		position: 'head',
		packageRole: 'page-script',
	} as ProcessedAsset;
	const runtimeScript = { ...pageScript, packageRole: 'runtime' } as ProcessedAsset;

	expect(dedupeProcessedAssets([pageScript, runtimeScript])).toEqual([pageScript, runtimeScript]);
});
