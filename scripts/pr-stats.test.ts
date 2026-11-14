import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished, test } from 'vitest';
import {
	COMMENT_MARKER,
	findLargeNewFiles,
	measureDir,
	listInstalledPackages,
	measurePages,
	median,
	renderComparison,
	selectPages,
	type Stats,
} from './pr-stats.ts';

function stats(overrides: Partial<Stats> = {}): Stats {
	return {
		buildMs: 1000,
		total: { bytes: 1000, files: 3 },
		pages: {
			'/': { vendor: 10_000, app: 5000, vendorChunks: ['react'] },
			'/api-lab': { vendor: 0, app: 2000, vendorChunks: [] },
		},
		types: {
			js: { bytes: 600, gzip: 200, files: 1 },
			css: { bytes: 200, gzip: 100, files: 1 },
			html: { bytes: 200, gzip: 100, files: 1 },
		},
		jsFiles: [{ file: 'a.js', bytes: 600, gzip: 200, vendor: false }],
		...overrides,
	};
}

test('median handles odd and even counts', () => {
	assert.equal(median([3, 1, 2]), 2);
	assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('measureDir totals by type, skips source maps and precompressed copies, and sorts JS by size', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'pr-stats-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(path.join(dir, 'assets'));
	writeFileSync(path.join(dir, 'assets', 'small.js'), 'a'.repeat(10));
	writeFileSync(path.join(dir, 'assets', 'big.js'), 'b'.repeat(100));
	writeFileSync(path.join(dir, 'assets', 'big.js.map'), 'm'.repeat(500));
	writeFileSync(path.join(dir, 'assets', 'big.js.gz'), 'g'.repeat(50));
	writeFileSync(path.join(dir, 'assets', 'big.js.br'), 'r'.repeat(40));
	writeFileSync(path.join(dir, 'index.html'), '<p></p>');
	const result = measureDir(dir, 5);
	assert.equal(result.types.js.bytes, 110);
	assert.equal(result.types.js.files, 2);
	assert.equal(result.total.bytes, 117);
	assert.deepEqual(
		result.jsFiles.map((file) => file.file),
		['assets/big.js', 'assets/small.js'],
	);
});

test('measurePages follows the static import closure once per file and splits vendor from app', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'pr-stats-pages-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(path.join(dir, 'assets'));
	mkdirSync(path.join(dir, 'blog'));
	const chunk = (name: string, body: string) => writeFileSync(path.join(dir, 'assets', name), body);
	chunk(
		'entry-AAAAAAAA.js',
		'import{a as x}from"./shared-BBBBBBBB.js";import"/assets/vendor-react-dom-CCCCCCCC.js";import("./lazy-DDDDDDDD.js");',
	);
	chunk('shared-BBBBBBBB.js', 'import{r as y}from"./vendor-react-dom-CCCCCCCC.js";export{y as a};');
	chunk('vendor-react-dom-CCCCCCCC.js', 'export const r=1;'.repeat(50));
	chunk('lazy-DDDDDDDD.js', 'export const lazy=1;'.repeat(500));
	chunk('preloaded-EEEEEEEE.js', 'export const p=1;');
	writeFileSync(
		path.join(dir, 'index.html'),
		'<script type="module" src="/assets/entry-AAAAAAAA.js"></script><link rel="modulepreload" href="/assets/preloaded-EEEEEEEE.js"><script>inline()</script>',
	);
	writeFileSync(path.join(dir, 'blog', 'index.html'), '<p>no scripts</p>');
	writeFileSync(path.join(dir, 'about.html'), '<script src="assets/preloaded-EEEEEEEE.js" type="module"></script>');
	const pages = measurePages(dir, new Set(['react-dom', 'ecopages-radiant']));
	assert.deepEqual(Object.keys(pages).sort(), ['/', '/about', '/blog']);
	assert.deepEqual(pages['/blog'], { vendor: 0, app: 0, vendorChunks: [] });
	assert.deepEqual(pages['/'].vendorChunks, ['react-dom']);
	assert.ok(pages['/'].vendor > 0);
	assert.ok(pages['/'].app > pages['/about'].app, 'closure includes entry and shared chunk');
	assert.ok(pages['/'].app < 300, 'dynamic import is not followed');
	assert.deepEqual(pages['/about'].vendorChunks, []);
});

test('a page chunk that only looks like vendor is app code, and scoped packages map to scope-name', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'pr-stats-vendor-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(path.join(dir, 'assets'));
	const chunk = (name: string) => writeFileSync(path.join(dir, 'assets', name), 'export const a=1;');
	chunk('vendor-share-BBBBBBBB.js');
	chunk('vendor-ecopages-radiant-CCCCCCCC.js');
	writeFileSync(
		path.join(dir, 'index.html'),
		'<script type="module" src="/assets/vendor-share-BBBBBBBB.js"></script><script type="module" src="/assets/vendor-ecopages-radiant-CCCCCCCC.js"></script>',
	);
	const page = measurePages(dir, new Set(['ecopages-radiant']))['/'];
	assert.deepEqual(page.vendorChunks, ['ecopages-radiant']);
	assert.ok(page.vendor > 0 && page.app > 0);
	assert.equal(measureDir(dir, 0, new Set(['ecopages-radiant'])).jsFiles.filter((file) => file.vendor).length, 1);
});

test('listInstalledPackages reads node_modules and the pnpm store, joining scoped names', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'pr-stats-installed-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(path.join(root, 'node_modules', 'react'), { recursive: true });
	mkdirSync(path.join(root, 'node_modules', '@ecopages', 'radiant'), { recursive: true });
	mkdirSync(path.join(root, 'node_modules', '.pnpm', 'morphdom@2.7.0', 'node_modules', 'morphdom'), {
		recursive: true,
	});
	assert.deepEqual([...listInstalledPackages(root)].sort(), ['ecopages-radiant', 'morphdom', 'react']);
});

test('selectPages picks smallest, median, largest and the named pages', () => {
	const head = stats({
		pages: {
			'/404': { vendor: 0, app: 0, vendorChunks: [] },
			'/': { vendor: 10, app: 10, vendorChunks: [] },
			'/b': { vendor: 0, app: 5, vendorChunks: [] },
			'/c': { vendor: 0, app: 50, vendorChunks: [] },
			'/api-lab': { vendor: 0, app: 7, vendorChunks: [] },
		},
	});
	assert.deepEqual(
		selectPages(head).map((row) => row.route),
		['/b', '/api-lab', '/c', '/', '/api-lab'],
	);
});

test('render leads with context and the per-page table, flagging growth per column', () => {
	const head = stats({
		total: { bytes: 1100, files: 3 },
		buildMs: 900,
		pages: {
			'/': { vendor: 10_000, app: 6000, vendorChunks: ['react'] },
			'/api-lab': { vendor: 0, app: 2000, vendorChunks: [] },
		},
	});
	const output = renderComparison(stats(), head);
	assert.ok(output.startsWith(COMMENT_MARKER));
	assert.match(output, /## Kitchen-sink build stats/);
	assert.match(output, /ecopages\.app\/dev\/benchmarks-and-ci/);
	assert.match(output, /\| Kita \| `\/` \| 9\.77 kB \| 4\.88 kB to 5\.86 kB \(\+1000 B \(\+20\.0%\)\) warning \|/);
	assert.match(output, /\| Kita, no React \| `\/api-lab` \| 0 B \| 1\.95 kB \|/);
	assert.match(output, /returning visitor mostly downloads only the app part/);
	assert.match(output, /-100 ms \(-10\.0%\)/);
	assert.match(output, /<details><summary>Totals for every page and asset<\/summary>/);
	assert.match(output, /All files in dist\/client \| 1000 B \| 1\.07 kB/);
	assert.match(output, /Vendor share of all JS/);
	assert.doesNotMatch(output, /Client total/);
});

test('a rehashed JS file is not treated as new', () => {
	const base = stats({
		jsFiles: [{ file: 'assets/client-Bn3vGHPx.js', bytes: 200_000, gzip: 60 * 1024, vendor: false }],
	});
	const head = stats({
		jsFiles: [{ file: 'assets/client-AAAAAAAA.js', bytes: 200_000, gzip: 60 * 1024, vendor: false }],
	});
	assert.deepEqual(findLargeNewFiles(base, head), []);
});

test('large new JS files are flagged but existing ones are not', () => {
	const big = { file: 'new.js', bytes: 200_000, gzip: 60 * 1024, vendor: false };
	const head = stats({ jsFiles: [{ file: 'a.js', bytes: 600, gzip: 60 * 1024, vendor: false }, big] });
	assert.deepEqual(findLargeNewFiles(stats(), head), [big]);
	assert.match(renderComparison(stats(), head), /New JS files over 50 kB gzip:\n\n- `new\.js`/);
});
