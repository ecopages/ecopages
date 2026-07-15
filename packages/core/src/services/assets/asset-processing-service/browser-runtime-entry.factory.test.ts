import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'vitest';
import { createBrowserRuntimeEntryModule } from './browser-runtime-entry.factory.ts';

test('createBrowserRuntimeEntryModule writes a shared runtime entry file', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');

	try {
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'node:path' }, { specifier: 'node:fs' }],
		});

		assert.equal(path.basename(filePath), 'runtime-entry.mjs');
		assert.equal(
			filePath,
			path.join(rootDir, '.eco', '.browser-runtime-entries', 'ecopages-react-runtime-test', 'runtime-entry.mjs'),
		);

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /export \{ .*basename.* \} from 'node:path';/);
		assert.match(contents, /export \{ .*readFileSync.* \} from 'node:fs';/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule prefers ESM entrypoints over require-resolved CJS files', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
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
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'dual-runtime', defaultExport: true }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /from '\.\..*node_modules\/dual-runtime\/index\.js';/);
		assert.doesNotMatch(contents, /index\.cjs/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule skips default re-export for ESM-only packages', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
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
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'named-only', defaultExport: true }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.doesNotMatch(contents, /export default/);
		assert.match(contents, /export \{ alpha \} from '\.\..*node_modules\/named-only\/index\.js';/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule emits default re-export for CJS-style packages like react', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
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
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'legacy-react', defaultExport: true }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /export default __ecopages_default_export__;/);
		assert.match(contents, /from '\.\..*node_modules\/legacy-react\/index\.js';/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule emits ESM default re-export for installed react', () => {
	const reactPackageDir = path.resolve(import.meta.dirname, '../../../../../integrations/react/node_modules/react');
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules'), { recursive: true });
	fs.symlinkSync(reactPackageDir, path.join(rootDir, 'node_modules', 'react'));

	try {
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'react', defaultExport: true }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /export default __ecopages_default_export__;/);
		assert.match(contents, /from '\.\..*node_modules\/react\/index\.js';/);
		assert.doesNotMatch(contents, /index\.cjs/);
		assert.doesNotMatch(contents, /__require|require\(/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule preserves a default export and deduplicates named exports', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'runtime-a'), { recursive: true });
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'runtime-b'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'runtime-a', 'index.js'),
		"module.exports = { default: 'runtime-a', alpha: 'a', shared: 'shared-a' };",
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'runtime-b', 'index.js'),
		"module.exports = { beta: 'b', shared: 'shared-b' };",
		'utf8',
	);

	try {
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'runtime-a', defaultExport: true }, { specifier: 'runtime-b' }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /import __ecopages_default_export__ from '\.\..*node_modules\/runtime-a\/index\.js';/);
		assert.match(contents, /export default __ecopages_default_export__;/);
		assert.match(contents, /export \{ alpha, shared \} from '\.\..*node_modules\/runtime-a\/index\.js';/);
		assert.match(contents, /export \{ beta \} from '\.\..*node_modules\/runtime-b\/index\.js';/);
		assert.doesNotMatch(contents, /export \{ .*shared.* \} from 'runtime-b';/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
