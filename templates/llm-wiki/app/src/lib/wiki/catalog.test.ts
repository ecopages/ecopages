import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CATALOG_GENERATED_COMMENT, renderCatalogMarkdown, writeFileIfChanged } from './catalog';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

test('writeFileIfChanged skips a byte-identical file so ingest does not churn mtime', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-write-if-changed-'));
	roots.push(root);
	const filePath = path.join(root, 'wiki-sort-order.json');
	const contents = `${JSON.stringify({ categories: ['app'] }, null, '\t')}\n`;
	await writeFile(filePath, contents, 'utf8');
	const before = await stat(filePath);

	expect(await writeFileIfChanged(filePath, contents)).toBe(false);
	const after = await stat(filePath);
	expect(after.mtimeMs).toBe(before.mtimeMs);
	expect(await readFile(filePath, 'utf8')).toBe(contents);
});

test('writeFileIfChanged writes when the file is missing or different', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-write-if-changed-missing-'));
	roots.push(root);
	const filePath = path.join(root, 'wiki-sort-order.json');

	expect(await writeFileIfChanged(filePath, 'one\n')).toBe(true);
	expect(await readFile(filePath, 'utf8')).toBe('one\n');
	expect(await writeFileIfChanged(filePath, 'two\n')).toBe(true);
	expect(await readFile(filePath, 'utf8')).toBe('two\n');
});
