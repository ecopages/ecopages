import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, afterAll, test } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	createDevHmrEntrypointCache,
	getDevHmrEntrypointCacheEntry,
	setDevHmrEntrypointCacheEntry,
} from './dev-hmr-entrypoint-cache.ts';

const tempRoots: string[] = [];
const originalNodeEnv = process.env.NODE_ENV;

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

function makeAppConfig(rootDir: string): EcoPagesAppConfig {
	return { rootDir } as unknown as EcoPagesAppConfig;
}

beforeAll(() => {
	process.env.NODE_ENV = 'development';
});

afterAll(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test('persists and restores a cold-graph entry across cache instances', () => {
	const rootDir = createTempRoot('dev-hmr-cache-persist');
	const appConfig = makeAppConfig(rootDir);

	const sourcePath = path.join(rootDir, 'widget.tsx');
	const outputPath = path.join(rootDir, '.eco', 'assets', '_hmr', 'widget.js');
	fs.writeFileSync(sourcePath, 'export {}', 'utf8');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, 'bundled', 'utf8');

	let cache = createDevHmrEntrypointCache(appConfig);
	assert.equal(getDevHmrEntrypointCacheEntry(cache, sourcePath), null);

	setDevHmrEntrypointCacheEntry(cache, sourcePath, {
		outputPath,
		outputUrl: '/assets/_hmr/widget.js',
		sourceMtimeMs: fs.statSync(sourcePath).mtimeMs,
		builtAt: Date.now(),
	});

	cache = createDevHmrEntrypointCache(appConfig);
	const hit = getDevHmrEntrypointCacheEntry(cache, sourcePath);
	assert.ok(hit);
	assert.equal(hit.outputUrl, '/assets/_hmr/widget.js');
});

test('cache hit is invalidated when the source mtime changes', () => {
	const rootDir = createTempRoot('dev-hmr-cache-mtime');
	const appConfig = makeAppConfig(rootDir);

	const sourcePath = path.join(rootDir, 'widget.tsx');
	const outputPath = path.join(rootDir, '.eco', 'assets', '_hmr', 'widget.js');
	fs.writeFileSync(sourcePath, 'export {}', 'utf8');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, 'bundled', 'utf8');

	const cache = createDevHmrEntrypointCache(appConfig);
	setDevHmrEntrypointCacheEntry(cache, sourcePath, {
		outputPath,
		outputUrl: '/assets/_hmr/widget.js',
		sourceMtimeMs: fs.statSync(sourcePath).mtimeMs,
		builtAt: Date.now(),
	});

	assert.ok(getDevHmrEntrypointCacheEntry(cache, sourcePath));

	// touch the source so its mtime moves forward
	fs.writeFileSync(sourcePath, 'export { changed }', 'utf8');

	assert.equal(getDevHmrEntrypointCacheEntry(cache, sourcePath), null);
});

test('cache hit is dropped when the on-disk artifact is removed', () => {
	const rootDir = createTempRoot('dev-hmr-cache-missing');
	const appConfig = makeAppConfig(rootDir);

	const sourcePath = path.join(rootDir, 'widget.tsx');
	const outputPath = path.join(rootDir, '.eco', 'assets', '_hmr', 'widget.js');
	fs.writeFileSync(sourcePath, 'export {}', 'utf8');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, 'bundled', 'utf8');

	const cache = createDevHmrEntrypointCache(appConfig);
	setDevHmrEntrypointCacheEntry(cache, sourcePath, {
		outputPath,
		outputUrl: '/assets/_hmr/widget.js',
		sourceMtimeMs: fs.statSync(sourcePath).mtimeMs,
		builtAt: Date.now(),
	});

	fs.rmSync(outputPath, { force: true });

	assert.equal(getDevHmrEntrypointCacheEntry(cache, sourcePath), null);
});
