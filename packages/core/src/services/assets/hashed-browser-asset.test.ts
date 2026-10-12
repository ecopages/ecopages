import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
	hashBrowserAssetBytes,
	HASHED_BROWSER_ASSET_INDEX_FILENAME,
	isHashedBrowserAsset,
	recordHashedBrowserAsset,
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
	expect(isHashedBrowserAsset(first)).toBe(true);
	const outputIndex = path.join(directory, HASHED_BROWSER_ASSET_INDEX_FILENAME);
	expect(existsSync(outputIndex)).toBe(true);
	expect(JSON.parse(readFileSync(outputIndex, 'utf8'))).toContain(path.basename(first));
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

test('uses recorded output paths instead of inferring content hashes from filenames', () => {
	const hashedOutput = path.join(directory, 'pages__docs__index-DlXqs-Dv.js');
	recordHashedBrowserAsset(hashedOutput);
	expect(isHashedBrowserAsset(hashedOutput)).toBe(true);
	expect(isHashedBrowserAsset(path.join(directory, 'site-navigation.js'))).toBe(false);
});

test('reloads the output index in a fresh server module before applying immutable caching', async () => {
	const filepath = writeHashedBrowserAsset({
		bytes: 'export const route = true;',
		directory,
		extension: '.js',
	});

	vi.resetModules();
	const { FileSystemServerResponseFactory } =
		await import('../../adapters/shared/http/fs-server-response-factory.ts');
	const responseFactory = new FileSystemServerResponseFactory({ options: { watchMode: false } });
	const response = await responseFactory.createFileResponse(filepath, 'text/javascript');

	expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
});
