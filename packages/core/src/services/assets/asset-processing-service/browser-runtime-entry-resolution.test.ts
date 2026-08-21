import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { test } from 'vitest';
import {
	inferBrowserRuntimeDefaultExportPolicy,
	resolveBrowserRuntimeEntryImport,
	resolvePackageEsmEntryPath,
} from './browser-runtime-entry-resolution.ts';

test('resolvePackageEsmEntryPath resolves installed react to index.js', () => {
	const rootDir = path.resolve(import.meta.dirname, '../../../../../integrations/react');
	const esmEntry = resolvePackageEsmEntryPath('react', rootDir);

	assert.ok(esmEntry);
	assert.match(esmEntry!, /node_modules\/react\/index\.js$/);
});

test('resolveBrowserRuntimeEntryImport prefers ESM entrypoints over require-resolved CJS files', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-resolution-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'dual-runtime'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'dual-runtime', 'package.json'),
		JSON.stringify({
			name: 'dual-runtime',
			exports: {
				'.': {
					import: './index.js',
					require: './index.cjs',
				},
			},
		}),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'dual-runtime', 'index.cjs'),
		"module.exports = { default: 'cjs' };",
		'utf8',
	);
	fs.writeFileSync(path.join(rootDir, 'node_modules', 'dual-runtime', 'index.js'), "export default 'esm';", 'utf8');

	try {
		const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
		const importSpecifier = resolveBrowserRuntimeEntryImport({
			specifier: 'dual-runtime',
			requireFromRoot,
			entryDir: path.join(rootDir, '.eco', 'entries'),
			rootDir,
		});

		assert.match(importSpecifier, /node_modules\/dual-runtime\/index\.js$/);
		assert.doesNotMatch(importSpecifier, /index\.cjs/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveBrowserRuntimeEntryImport resolves packages that expose only an import condition', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-resolution-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'import-only'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'import-only', 'package.json'),
		JSON.stringify({ name: 'import-only', exports: { '.': { import: './index.js' } } }),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'import-only', 'index.js'),
		"export const flavor = 'esm';",
		'utf8',
	);

	try {
		const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
		const importSpecifier = resolveBrowserRuntimeEntryImport({
			specifier: 'import-only',
			requireFromRoot,
			entryDir: path.join(rootDir, '.eco', 'entries'),
			rootDir,
		});

		assert.match(importSpecifier, /node_modules\/import-only\/index\.js$/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('resolveBrowserRuntimeEntryImport prefers the module field for legacy dual packages', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-resolution-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'legacy-dual', 'es'), { recursive: true });
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'legacy-dual', 'dist'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-dual', 'package.json'),
		JSON.stringify({ name: 'legacy-dual', main: './dist/index.js', module: './es/index.js' }),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-dual', 'dist', 'index.js'),
		"module.exports = 'cjs';",
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-dual', 'es', 'index.js'),
		"export const flavor = 'esm';",
		'utf8',
	);

	try {
		const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
		const importSpecifier = resolveBrowserRuntimeEntryImport({
			specifier: 'legacy-dual',
			requireFromRoot,
			entryDir: path.join(rootDir, '.eco', 'entries'),
			rootDir,
		});

		assert.match(importSpecifier, /node_modules\/legacy-dual\/es\/index\.js$/);
		assert.doesNotMatch(importSpecifier, /dist\/index\.js$/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('inferBrowserRuntimeDefaultExportPolicy skips default for ESM named-only packages', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-resolution-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'named-only'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'named-only', 'package.json'),
		JSON.stringify({
			name: 'named-only',
			exports: {
				'.': {
					import: './index.js',
					require: './index.cjs',
				},
			},
		}),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'named-only', 'index.cjs'),
		"module.exports = { alpha: 'a' };",
		'utf8',
	);
	fs.writeFileSync(path.join(rootDir, 'node_modules', 'named-only', 'index.js'), "export const alpha = 'a';", 'utf8');

	try {
		const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
		assert.equal(
			inferBrowserRuntimeDefaultExportPolicy({
				specifier: 'named-only',
				requireFromRoot,
				rootDir,
			}),
			'skip-default',
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('inferBrowserRuntimeDefaultExportPolicy inspects the module field of a legacy dual package', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-resolution-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'legacy-named', 'es'), { recursive: true });
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'legacy-named', 'dist'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-named', 'package.json'),
		JSON.stringify({ name: 'legacy-named', main: './dist/index.js', module: './es/index.js' }),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-named', 'dist', 'index.js'),
		"module.exports = { alpha: 'cjs' };",
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-named', 'es', 'index.js'),
		"export const alpha = 'esm';",
		'utf8',
	);

	try {
		const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
		assert.equal(
			inferBrowserRuntimeDefaultExportPolicy({ specifier: 'legacy-named', requireFromRoot, rootDir }),
			'skip-default',
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('inferBrowserRuntimeDefaultExportPolicy emits default for CJS-style packages like react', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-resolution-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'legacy-react'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-react', 'package.json'),
		JSON.stringify({
			name: 'legacy-react',
			exports: {
				'.': {
					import: './index.js',
					require: './index.cjs',
				},
			},
		}),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-react', 'index.cjs'),
		'module.exports = { Fragment: true, createElement: () => null };',
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'legacy-react', 'index.js'),
		["'use strict';", "module.exports = require('./index.cjs');"].join('\n'),
		'utf8',
	);

	try {
		const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
		assert.equal(
			inferBrowserRuntimeDefaultExportPolicy({
				specifier: 'legacy-react',
				requireFromRoot,
				rootDir,
			}),
			'emit-default',
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('inferBrowserRuntimeDefaultExportPolicy skips default for installed @tanstack/react-query', () => {
	const rootDir = path.resolve(import.meta.dirname, '../../..');
	const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));

	assert.equal(
		inferBrowserRuntimeDefaultExportPolicy({
			specifier: '@tanstack/react-query',
			requireFromRoot,
			rootDir,
		}),
		'skip-default',
	);
});
