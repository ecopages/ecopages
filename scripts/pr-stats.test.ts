import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished, test } from 'vitest';
import { COMMENT_MARKER, findLargeNewFiles, measureDir, median, renderComparison, type Stats } from './pr-stats.ts';

function stats(overrides: Partial<Stats> = {}): Stats {
	return {
		buildMs: 1000,
		total: { bytes: 1000, gzip: 400 },
		types: {
			js: { bytes: 600, gzip: 200, files: 1 },
			css: { bytes: 200, gzip: 100, files: 1 },
			html: { bytes: 200, gzip: 100, files: 1 },
		},
		jsFiles: [{ file: 'a.js', bytes: 600, gzip: 200 }],
		...overrides,
	};
}

test('median handles odd and even counts', () => {
	assert.equal(median([3, 1, 2]), 2);
	assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('measureDir totals by type, skips source maps and sorts JS by size', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'pr-stats-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(path.join(dir, 'assets'));
	writeFileSync(path.join(dir, 'assets', 'small.js'), 'a'.repeat(10));
	writeFileSync(path.join(dir, 'assets', 'big.js'), 'b'.repeat(100));
	writeFileSync(path.join(dir, 'assets', 'big.js.map'), 'm'.repeat(500));
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

test('render shows deltas and warns only past the growth threshold', () => {
	const head = stats({ total: { bytes: 1100, gzip: 410 }, buildMs: 900 });
	const output = renderComparison(stats(), head);
	assert.ok(output.startsWith(COMMENT_MARKER));
	assert.match(output, /\| Client total \| 1000 B \| 1\.07 kB \| \+100 B \(\+10\.0%\) \| warning \|/);
	assert.match(output, /\| Client total \(gzip\) \| 400 B \| 410 B \| \+10 B \(\+2\.5%\) \|  \|/);
	assert.match(output, /-100 ms \(-10\.0%\)/);
});

test('a rehashed JS file is not treated as new', () => {
	const base = stats({ jsFiles: [{ file: 'assets/client-Bn3vGHPx.js', bytes: 200_000, gzip: 60 * 1024 }] });
	const head = stats({ jsFiles: [{ file: 'assets/client-AAAAAAAA.js', bytes: 200_000, gzip: 60 * 1024 }] });
	assert.deepEqual(findLargeNewFiles(base, head), []);
});

test('large new JS files are flagged but existing ones are not', () => {
	const big = { file: 'new.js', bytes: 200_000, gzip: 60 * 1024 };
	const head = stats({ jsFiles: [{ file: 'a.js', bytes: 600, gzip: 60 * 1024 }, big] });
	assert.deepEqual(findLargeNewFiles(stats(), head), [big]);
	assert.match(renderComparison(stats(), head), /New JS files over 50 kB gzip:\n\n- `new\.js`/);
});
