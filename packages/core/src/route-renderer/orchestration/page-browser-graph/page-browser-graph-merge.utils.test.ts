import { describe, expect, it } from 'vitest';
import { createPagePackage, type ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { mergePageBrowserGraphIntoPagePackage } from './page-browser-graph-merge.utils.ts';

function scriptAsset(filepath: string): ProcessedAsset {
	return {
		kind: 'script',
		position: 'body',
		attributes: { src: filepath },
		filepath,
	} as ProcessedAsset;
}

describe('mergePageBrowserGraphIntoPagePackage', () => {
	it('returns undefined when no page browser graph is provided', () => {
		const host = {
			getPagePackage: () => undefined,
			getProcessedDependencies: () => [],
			dedupeProcessedAssets: (assets: readonly ProcessedAsset[]) => [...assets],
			setPagePackage: () => {
				throw new Error('should not set package');
			},
		};

		expect(mergePageBrowserGraphIntoPagePackage(host, undefined)).toBeUndefined();
	});

	it('merges graph assets into an existing page package and rebuilds the package', () => {
		const existing = scriptAsset('/existing.js');
		const entry = scriptAsset('/entry.js');
		const chunk = scriptAsset('/chunk.js');
		let stored = createPagePackage([existing], {
			pageBrowserGraph: {
				entryAssets: [existing],
				chunkAssets: [],
			},
		});

		const host = {
			getPagePackage: () => stored,
			getProcessedDependencies: () => [existing],
			dedupeProcessedAssets: (assets: readonly ProcessedAsset[]) => {
				const seen = new Set<string>();
				return assets.filter((asset) => {
					const key = String((asset as { filepath?: string }).filepath ?? '');
					if (seen.has(key)) {
						return false;
					}
					seen.add(key);
					return true;
				});
			},
			setPagePackage: (pagePackage: typeof stored) => {
				stored = pagePackage;
			},
		};

		const merged = mergePageBrowserGraphIntoPagePackage(host, {
			entryAssets: [entry],
			chunkAssets: [chunk],
		});

		expect(merged?.entryAssets.map((asset) => (asset as { filepath?: string }).filepath)).toEqual([
			'/existing.js',
			'/entry.js',
		]);
		expect(merged?.chunkAssets.map((asset) => (asset as { filepath?: string }).filepath)).toEqual(['/chunk.js']);
		expect(stored.pageBrowserGraph).toEqual(merged);
	});
});
