import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import { resolveBarePackageBrowserEntry } from './tsconfig-import-resolver.ts';

const tempRoots: string[] = [];

function createLegacyDualEntryFixture(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-entry-fixture-'));
	tempRoots.push(root);

	const packageDir = path.join(root, 'node_modules', 'dual-entry-pkg');
	const distDir = path.join(packageDir, 'dist');
	fs.mkdirSync(distDir, { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify(
			{
				name: 'dual-entry-pkg',
				main: './dist/main.cjs',
				module: './dist/module.mjs',
				browser: './dist/browser.umd.js',
			},
			null,
			2,
		),
	);
	fs.writeFileSync(path.join(distDir, 'main.cjs'), 'module.exports = {};');
	fs.writeFileSync(path.join(distDir, 'module.mjs'), 'export default {};');
	fs.writeFileSync(path.join(distDir, 'browser.umd.js'), 'module.exports = {};');

	return root;
}

function createExportsDualEntryFixture(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-exports-fixture-'));
	tempRoots.push(root);

	const packageDir = path.join(root, 'node_modules', 'exports-dual-pkg');
	const distDir = path.join(packageDir, 'dist');
	fs.mkdirSync(distDir, { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify(
			{
				name: 'exports-dual-pkg',
				exports: {
					'.': {
						browser: './dist/browser.umd.js',
						import: './dist/module.mjs',
						default: './dist/main.cjs',
					},
				},
			},
			null,
			2,
		),
	);
	fs.writeFileSync(path.join(distDir, 'main.cjs'), 'module.exports = {};');
	fs.writeFileSync(path.join(distDir, 'module.mjs'), 'export default {};');
	fs.writeFileSync(path.join(distDir, 'browser.umd.js'), 'module.exports = {};');

	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test('resolveBarePackageBrowserEntry prefers module over browser for third-party packages', () => {
	const root = createLegacyDualEntryFixture();
	const resolved = resolveBarePackageBrowserEntry(root, 'dual-entry-pkg');
	assert.ok(resolved);
	assert.match(resolved, /module\.mjs$/);
});

test('resolveBarePackageBrowserEntry prefers import over browser exports for third-party packages', () => {
	const root = createExportsDualEntryFixture();
	const resolved = resolveBarePackageBrowserEntry(root, 'exports-dual-pkg');
	assert.ok(resolved);
	assert.match(resolved, /module\.mjs$/);
});
