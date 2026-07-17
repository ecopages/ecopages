import { describe, expect, it } from 'vitest';
import { createPagePackage, type ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { mergePageBrowserGraph } from './page-browser-graph-merge.utils.ts';

function scriptAsset(filepath: string): ProcessedAsset {
	return {
		kind: 'script',
		position: 'body',
		attributes: { src: filepath },
		filepath,
	} as ProcessedAsset;
}

describe('mergePageBrowserGraph', () => {
	it('merges graph assets into an existing page package and rebuilds the package', () => {
		const existing = scriptAsset('/existing.js');
		const entry = scriptAsset('/entry.js');
		const chunk = scriptAsset('/chunk.js');
		const current = createPagePackage([existing], {
			pageBrowserGraph: {
				entryAssets: [existing],
				chunkAssets: [],
			},
		});

		const { pagePackage, mergedGraph } = mergePageBrowserGraph(current, [existing], {
			entryAssets: [entry],
			chunkAssets: [chunk],
		});

		expect(mergedGraph.entryAssets.map((asset) => (asset as { filepath?: string }).filepath)).toEqual([
			'/existing.js',
			'/entry.js',
		]);
		expect(mergedGraph.chunkAssets.map((asset) => (asset as { filepath?: string }).filepath)).toEqual([
			'/chunk.js',
		]);
		expect(pagePackage.pageBrowserGraph).toEqual(mergedGraph);
	});

	it('uses processed dependencies when no current page package exists', () => {
		const base = scriptAsset('/base.js');
		const entry = scriptAsset('/entry.js');

		const { pagePackage, mergedGraph } = mergePageBrowserGraph(undefined, [base], {
			entryAssets: [entry],
			chunkAssets: [],
		});

		expect(mergedGraph.entryAssets).toEqual([entry]);
		expect(pagePackage.assets.map((asset) => (asset as { filepath?: string }).filepath)).toEqual([
			'/base.js',
			'/entry.js',
		]);
		expect(pagePackage.pageBrowserGraph).toEqual(mergedGraph);
	});

	it('preserves the page browser graph when package assets are rebuilt', () => {
		const entry = scriptAsset('/entry.js');
		const chunk = scriptAsset('/chunk.js');
		const extra = scriptAsset('/extra.js');
		const current = createPagePackage([extra], {
			pageBrowserGraph: {
				entryAssets: [entry],
				chunkAssets: [chunk],
			},
		});

		const { pagePackage, mergedGraph } = mergePageBrowserGraph(current, [extra], {
			entryAssets: [entry],
			chunkAssets: [chunk],
		});

		expect(pagePackage.pageBrowserGraph).toEqual(mergedGraph);
		expect(mergedGraph.entryAssets).toEqual([entry]);
		expect(mergedGraph.chunkAssets).toEqual([chunk]);
	});
});
