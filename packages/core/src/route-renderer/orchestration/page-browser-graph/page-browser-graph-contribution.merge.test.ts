import { describe, expect, test } from 'vitest';
import { mergePageBrowserGraphContributions } from './page-browser-graph-contribution.merge.ts';

describe('mergePageBrowserGraphContributions', () => {
	test('merges dependencies and assets from multiple contributions', () => {
		const merged = mergePageBrowserGraphContributions(
			{
				dependencies: [{ kind: 'script', source: 'file', filepath: '/app/a.ts' }],
			},
			{
				assets: [{ kind: 'script', inline: false, filepath: '/assets/b.js' }],
			},
		);

		expect(merged).toEqual({
			dependencies: [{ kind: 'script', source: 'file', filepath: '/app/a.ts' }],
			assets: [{ kind: 'script', inline: false, filepath: '/assets/b.js' }],
		});
	});

	test('returns undefined when all contributions are empty', () => {
		expect(mergePageBrowserGraphContributions(undefined, { assets: [] })).toBeUndefined();
	});
});
