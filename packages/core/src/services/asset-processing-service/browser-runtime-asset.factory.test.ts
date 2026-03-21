import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
	BROWSER_RUNTIME_SCRIPT_ATTRIBUTES,
	buildBrowserRuntimeAssetUrl,
	createBrowserRuntimeModuleAsset,
	createBrowserRuntimeScriptAsset,
} from './browser-runtime-asset.factory.ts';

test('buildBrowserRuntimeAssetUrl uses the vendors asset directory', () => {
	assert.equal(buildBrowserRuntimeAssetUrl('react.js'), '/assets/vendors/react.js');
});

test('createBrowserRuntimeScriptAsset creates a hidden head runtime bundle asset', () => {
	const plugin = { name: 'runtime-plugin', setup() {} };
	const asset = createBrowserRuntimeScriptAsset({
		importPath: '/tmp/react-entry.mjs',
		name: 'react',
		fileName: 'react.js',
		bundleOptions: {
			plugins: [plugin],
		},
	});

	assert.deepEqual(asset, {
		kind: 'script',
		source: 'node-module',
		position: 'head',
		importPath: '/tmp/react-entry.mjs',
		name: 'react',
		excludeFromHtml: true,
		bundleOptions: {
			naming: 'react.js',
			plugins: [plugin],
		},
		attributes: BROWSER_RUNTIME_SCRIPT_ATTRIBUTES,
	});
});

test('createBrowserRuntimeModuleAsset creates an entry module and hidden runtime asset together', () => {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-browser-runtime-asset-'));
	fs.writeFileSync(path.join(rootDir, 'package.json'), '{}', 'utf8');
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'runtime-a'), { recursive: true });
	fs.writeFileSync(
		path.join(rootDir, 'node_modules', 'runtime-a', 'index.js'),
		"module.exports = { default: 'runtime-a', alpha: 'a' };",
		'utf8',
	);

	try {
		const asset = createBrowserRuntimeModuleAsset({
			rootDir,
			cacheDirName: 'ecopages-browser-runtime-test',
			modules: [{ specifier: 'runtime-a', defaultExport: true }],
			name: 'runtime-a',
			fileName: 'runtime-a.js',
		});

		assert.equal(asset.source, 'node-module');
		assert.equal(
			asset.importPath.endsWith(path.join('ecopages-browser-runtime-test', 'runtime-a-entry.mjs')),
			true,
		);
		assert.equal(asset.bundleOptions?.naming, 'runtime-a.js');
		assert.equal(asset.excludeFromHtml, true);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
