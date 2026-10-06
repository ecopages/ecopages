import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import {
	hashBrowserAssetBytes,
	isContentHashedAssetFilename,
	writeHashedBrowserAsset,
} from './hashed-browser-asset.ts';

let directory: string;

beforeEach(() => {
	directory = mkdtempSync(path.join(tmpdir(), 'hashed-browser-asset-'));
});

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

test('names the file from a hash of the written bytes and keeps the name when bytes are unchanged', () => {
	const first = writeHashedBrowserAsset({
		bytes: '.root { color: red; }',
		directory,
		extension: '.css',
	});
	const second = writeHashedBrowserAsset({
		bytes: '.root { color: red; }',
		directory,
		extension: '.css',
	});
	const hash = hashBrowserAssetBytes('.root { color: red; }');
	expect(path.basename(first)).toBe(`${hash}.css`);
	expect(second).toBe(first);
	expect(readFileSync(first, 'utf-8')).toBe('.root { color: red; }');
});

test('changes the URL when the bytes change', () => {
	const first = writeHashedBrowserAsset({
		bytes: '.root { color: red; }',
		directory,
		extension: 'css',
	});
	const second = writeHashedBrowserAsset({
		bytes: '.root { color: blue; }',
		directory,
		extension: 'css',
	});
	expect(second).not.toBe(first);
	expect(path.basename(second)).toBe(`${hashBrowserAssetBytes('.root { color: blue; }')}.css`);
});

test('recognizes content-hashed production filenames and leaves stable vendor names alone', () => {
	expect(isContentHashedAssetFilename(`${hashBrowserAssetBytes('body{}')}.css`)).toBe(true);
	expect(isContentHashedAssetFilename('counter-BnV4AN8o.js')).toBe(true);
	expect(isContentHashedAssetFilename('react.js')).toBe(false);
	expect(isContentHashedAssetFilename('tiny-query.js')).toBe(false);
});
