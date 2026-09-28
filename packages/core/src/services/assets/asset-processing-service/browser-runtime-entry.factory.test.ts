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
		assert.match(contents, /export \* from 'node:path';/);
		assert.match(contents, /export \* from 'node:fs';/);
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

test('createBrowserRuntimeEntryModule skips default re-export for installed @tanstack/react-query', () => {
	const reactQueryPackageDir = path.resolve(import.meta.dirname, '../../../../node_modules/@tanstack/react-query');
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', '@tanstack'), { recursive: true });
	fs.symlinkSync(reactQueryPackageDir, path.join(rootDir, 'node_modules', '@tanstack', 'react-query'));

	try {
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: '@tanstack/react-query', defaultExport: true }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.doesNotMatch(contents, /export default/);
		assert.match(contents, /from '\.\..*node_modules\/@tanstack\/react-query\/.*\.js';/);
		assert.doesNotMatch(contents, /index\.cjs/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule preserves a default export and deduplicates CJS named exports', () => {
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
		assert.doesNotMatch(contents, /export \{ .*shared.* \} from '.*runtime-b/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule re-exports jsx from the CJS react jsx-runtime entry', () => {
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
			modules: [
				{ specifier: 'react', defaultExport: true },
				{ specifier: 'react/jsx-runtime' },
				{ specifier: 'react/jsx-dev-runtime' },
			],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /export \{[^}]*\bjsx\b[^}]*\} from '\.\..*node_modules\/react\/jsx-runtime\.js';/);
		assert.match(contents, /export \{[^}]*\bjsxs\b[^}]*\} from '\.\..*node_modules\/react\/jsx-runtime\.js';/);
		assert.match(contents, /export \{[^}]*\bFragment\b[^}]*\} from '\.\..*node_modules\/react\/index\.js';/);
		assert.doesNotMatch(contents, /export \* from '\.\..*node_modules\/react\//);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeEntryModule does not re-export enumerable CJS statics absent from the ESM entry', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-browser-runtime-entry-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'static-default', 'dist'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'static-default', 'package.json'),
		JSON.stringify({ name: 'static-default', main: './index.cjs', module: './dist/index.js' }),
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'static-default', 'index.cjs'),
		'module.exports = Object.assign(function runtime() {}, { plugin: true });',
		'utf8',
	);
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'static-default', 'dist', 'index.js'),
		'export default function runtime() {}',
		'utf8',
	);

	try {
		const filePath = createBrowserRuntimeEntryModule({
			rootDir,
			cacheDirName: 'ecopages-react-runtime-test',
			fileName: 'runtime-entry.mjs',
			modules: [{ specifier: 'static-default', defaultExport: true }],
		});

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /export \* from '\.\..*node_modules\/static-default\/dist\/index\.js';/);
		assert.doesNotMatch(contents, /plugin/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
