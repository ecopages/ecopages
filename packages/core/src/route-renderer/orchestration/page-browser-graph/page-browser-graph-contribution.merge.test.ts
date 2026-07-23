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

	test('merges watchPaths from multiple contributions', () => {
		const merged = mergePageBrowserGraphContributions(
			{ watchPaths: ['/app/content/intro.mdx'] },
			{ watchPaths: ['/app/components/demo.tsx', '/app/content/intro.mdx'] },
		);

		expect(merged).toEqual({
			watchPaths: ['/app/content/intro.mdx', '/app/components/demo.tsx'],
		});
	});

	test('returns undefined when all contributions are empty', () => {
		expect(mergePageBrowserGraphContributions(undefined, { assets: [] })).toBeUndefined();
	});
});
