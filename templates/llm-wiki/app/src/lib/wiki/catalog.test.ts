import { expect, test } from 'vitest';
import { CATALOG_GENERATED_COMMENT, renderCatalogMarkdown } from './catalog';

test('renderCatalogMarkdown follows sort order and keeps summaries', () => {
	const markdown = renderCatalogMarkdown({
		categories: ['concept', 'app'],
		pagesByTitle: {
			concept: ['Wiki structure'],
			app: ['Demo'],
		},
		entries: [
			{ category: 'app', slug: 'app/demo', title: 'Demo', summary: 'example page' },
			{
				category: 'concept',
				slug: 'concept/wiki-structure',
				title: 'Wiki structure',
				summary: 'how it is organized',
			},
		],
	});

	expect(markdown).toBe(`${CATALOG_GENERATED_COMMENT}

# Index

Catalog of wiki pages, grouped by category. Updated on every ingest.

## Concept

- [wiki-structure](./wiki/concept/wiki-structure.md) — how it is organized

## App

- [demo](./wiki/app/demo.md) — example page
`);
});

test('catalog preserves distinct slugs with duplicate titles in explicit and fallback order', () => {
	const entries = [
		{ category: 'app', slug: 'app/two', title: 'Same', summary: 'second' },
		{ category: 'app', slug: 'app/one', title: 'Same', summary: 'first' },
	];
	for (const titles of [[], ['Same']]) {
		const markdown = renderCatalogMarkdown({ categories: ['app'], pagesByTitle: { app: titles }, entries });
		expect(markdown).toContain('- [one](./wiki/app/one.md) — first');
		expect(markdown).toContain('- [two](./wiki/app/two.md) — second');
		expect(markdown.indexOf('[one]')).toBeLessThan(markdown.indexOf('[two]'));
	}
});
