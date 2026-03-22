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
			path.join(rootDir, 'node_modules', '.cache', 'ecopages-react-runtime-test', 'runtime-entry.mjs'),
		);

		const contents = fs.readFileSync(filePath, 'utf8');
		assert.match(contents, /export \{ .*basename.* \} from 'node:path';/);
		assert.match(contents, /export \{ .*readFileSync.* \} from 'node:fs';/);
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
		assert.match(contents, /import __ecopages_default_export__ from 'runtime-a';/);
		assert.match(contents, /export default __ecopages_default_export__;/);
		assert.match(contents, /export \{ alpha, shared \} from 'runtime-a';/);
		assert.match(contents, /export \{ beta \} from 'runtime-b';/);
		assert.doesNotMatch(contents, /export \{ .*shared.* \} from 'runtime-b';/);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
