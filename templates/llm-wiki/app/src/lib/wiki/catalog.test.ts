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
