import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	BROWSER_RUNTIME_SCRIPT_ATTRIBUTES,
	buildBrowserRuntimeAssetUrl,
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