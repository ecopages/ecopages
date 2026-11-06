import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished, test } from 'vitest';
import { checkDevPages, findStalePages, formatReport, parseSources, readDevPages } from './check-dev-pages.ts';

const page = (sources: string[]) =>
	['---', 'title: "Page"', 'sources:', ...sources.map((source) => `  - ${source}`), '---', '', '# Page', ''].join(
		'\n',
	);

test('parseSources reads the sources list from the frontmatter', () => {
	assert.deepEqual(parseSources(page(['packages/core/src/build/', 'packages/core/src/hmr/hmr.ts'])), [
		'packages/core/src/build/',
		'packages/core/src/hmr/hmr.ts',
	]);
});

test('parseSources accepts quoted entries and stops at the next key', () => {
	const source = ['---', 'sources:', '  - "a/b/"', "  - 'c.ts'", 'order: 2', '---', '- not/a/source'].join('\n');
	assert.deepEqual(parseSources(source), ['a/b/', 'c.ts']);
});

test('parseSources returns an empty list without frontmatter sources', () => {
	assert.deepEqual(parseSources('---\ntitle: "x"\n---\n\nsources:\n  - a/\n'), []);
	assert.deepEqual(parseSources('# no frontmatter'), []);
});

test('findStalePages flags a page whose sources changed while the page did not', () => {
	const pages = [
		{ path: 'dev/build.mdx', sources: ['packages/core/src/build/'] },
		{ path: 'dev/hmr.mdx', sources: ['packages/core/src/hmr/hmr.ts'] },
	];
	assert.deepEqual(findStalePages(pages, ['packages/core/src/build/a.ts', 'packages/core/src/build/b/c.ts']), [
		{ page: 'dev/build.mdx', files: ['packages/core/src/build/a.ts', 'packages/core/src/build/b/c.ts'] },
	]);
});

test('findStalePages passes when the page changed with its sources', () => {
	const pages = [{ path: 'dev/build.mdx', sources: ['packages/core/src/build/'] }];
	assert.deepEqual(findStalePages(pages, ['packages/core/src/build/a.ts', 'dev/build.mdx']), []);
});

test('findStalePages matches a directory source by whole segments and a file source exactly', () => {
	const pages = [
		{ path: 'dev/build.mdx', sources: ['packages/core/src/build/'] },
		{ path: 'dev/hmr.mdx', sources: ['packages/core/src/hmr/hmr.ts'] },
	];
	assert.deepEqual(
		findStalePages(pages, ['packages/core/src/build-cache/a.ts', 'packages/core/src/hmr/hmr.test.ts']),
		[],
	);
});

test('checkDevPages reports pages without sources and sources that do not exist', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'check-dev-pages-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(path.join(root, 'pages'));
	mkdirSync(path.join(root, 'src/build'), { recursive: true });
	writeFileSync(path.join(root, 'src/build/a.ts'), '');
	writeFileSync(path.join(root, 'pages/build.mdx'), page(['src/build/', 'src/gone.ts']));
	writeFileSync(path.join(root, 'pages/empty.mdx'), page([]));

	const pages = readDevPages(root, 'pages');
	assert.deepEqual(
		pages.map((entry) => entry.path),
		['pages/build.mdx', 'pages/empty.mdx'],
	);

	const result = checkDevPages(root, pages, ['src/build/a.ts']);
	assert.deepEqual(result.problems, [
		'pages/build.mdx lists a source that does not exist: src/gone.ts',
		'pages/empty.mdx declares no sources.',
	]);
	assert.deepEqual(result.stale, [{ page: 'pages/build.mdx', files: ['src/build/a.ts'] }]);
});

test('formatReport names each page to update and the opt-out', () => {
	const report = formatReport({ problems: [], stale: [{ page: 'pages/build.mdx', files: ['src/build/a.ts'] }] });
	assert.match(report, /pages\/build\.mdx/);
	assert.match(report, /src\/build\/a\.ts/);
	assert.match(report, /docs-not-needed/);
	assert.equal(formatReport({ problems: [], stale: [] }), '');
});
