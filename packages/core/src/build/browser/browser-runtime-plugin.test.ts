import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test } from 'vitest';
import { createBrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import {
	BROWSER_RUNTIME_IMPORT_REWRITE_MAP,
	DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
	createBrowserRuntimePlugin,
	getBrowserRuntimeImportRewriteMap,
} from './browser-runtime-plugin.ts';
import type { EcoBuildOnLoadResult, EcoBuildOnResolveResult } from '../contracts/build-types.ts';

const manifest = createBrowserRuntimeManifest([
	{
		specifier: 'react',
		owner: '@ecopages/react',
		importPath: 'react',
		publicPath: '/assets/vendors/react.js',
	},
	{
		specifier: 'react-dom/client',
		owner: '@ecopages/react',
		importPath: 'react-dom/client',
		publicPath: '/assets/vendors/react-dom.js',
	},
]);

type ResolveCallback = (args: {
	path: string;
}) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
type LoadCallback = (args: {
	path: string;
}) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;

function captureCallbacks(): {
	resolveCallbacks: ResolveCallback[];
	loadCallbacks: LoadCallback[];
} {
	const resolveCallbacks: ResolveCallback[] = [];
	const loadCallbacks: LoadCallback[] = [];
	return {
		resolveCallbacks,
		loadCallbacks,
	};
}

function setupPlugin(
	plugin: ReturnType<typeof createBrowserRuntimePlugin>,
	callbacks: ReturnType<typeof captureCallbacks>,
): void {
	assert.ok(plugin);
	plugin.setup({
		onResolve(_options, callback) {
			callbacks.resolveCallbacks.push(callback as ResolveCallback);
		},
		onLoad(_options, callback) {
			callbacks.loadCallbacks.push(callback as LoadCallback);
		},
		module() {},
	});
}

test('createBrowserRuntimePlugin returns null for an empty manifest', () => {
	assert.equal(createBrowserRuntimePlugin({ manifest: createBrowserRuntimeManifest() }), null);
});

test('createBrowserRuntimePlugin uses default name when not provided', () => {
	const plugin = createBrowserRuntimePlugin({ manifest });
	assert.ok(plugin);
	assert.equal(plugin.name, DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME);
});

test('createBrowserRuntimePlugin honors a custom name', () => {
	const plugin = createBrowserRuntimePlugin({ manifest, name: 'custom-runtime-plugin' });
	assert.ok(plugin);
	assert.equal(plugin.name, 'custom-runtime-plugin');
});

test('createBrowserRuntimePlugin exposes the specifier map under the canonical symbol', () => {
	const plugin = createBrowserRuntimePlugin({ manifest });
	assert.ok(plugin);
	const map = getBrowserRuntimeImportRewriteMap(plugin);
	assert.ok(map);
	assert.deepEqual(Array.from(map.entries()), [
		['react', '/assets/vendors/react.js'],
		['react-dom/client', '/assets/vendors/react-dom.js'],
	]);
	assert.equal((plugin as Record<symbol, unknown>)[BROWSER_RUNTIME_IMPORT_REWRITE_MAP], map);
});

test('createBrowserRuntimePlugin in full mode registers alias, publicPath, and onLoad hooks', () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest });
	setupPlugin(plugin, callbacks);
	assert.equal(callbacks.resolveCallbacks.length, 2, 'alias + publicPath');
	assert.equal(callbacks.loadCallbacks.length, 1, 'source rewrite');
});

test('createBrowserRuntimePlugin in alias-only mode skips rewrite and publicPath hooks', () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({
		manifest,
		name: 'alias-only',
		rewriteImports: false,
		matchPublicPaths: false,
	});
	setupPlugin(plugin, callbacks);
	assert.equal(callbacks.resolveCallbacks.length, 1, 'alias only');
	assert.equal(callbacks.loadCallbacks.length, 0, 'no source rewrite');
});

test('createBrowserRuntimePlugin in rewrite-only mode registers alias and onLoad but skips publicPath', () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({
		manifest,
		name: 'rewrite-only',
		external: false,
		matchPublicPaths: false,
	});
	setupPlugin(plugin, callbacks);
	assert.equal(callbacks.resolveCallbacks.length, 1, 'alias only');
	assert.equal(callbacks.loadCallbacks.length, 1, 'source rewrite still on');
});

test('createBrowserRuntimePlugin alias resolve honors custom external flag', async () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest, external: false });
	setupPlugin(plugin, callbacks);
	const resolve = async (specifier: string) => {
		for (const callback of callbacks.resolveCallbacks) {
			const result = await callback({ path: specifier });
			if (result) return result;
		}
		return undefined;
	};
	assert.deepEqual(await resolve('react'), {
		path: '/assets/vendors/react.js',
		external: false,
	});
});

test('createBrowserRuntimePlugin alias resolve defaults to external: true', async () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest });
	setupPlugin(plugin, callbacks);
	const resolve = async (specifier: string) => {
		for (const callback of callbacks.resolveCallbacks) {
			const result = await callback({ path: specifier });
			if (result) return result;
		}
		return undefined;
	};
	assert.deepEqual(await resolve('react'), {
		path: '/assets/vendors/react.js',
		external: true,
	});
});

test('createBrowserRuntimePlugin publicPath resolve only matches in-set paths', async () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest, name: 'with-public-paths' });
	setupPlugin(plugin, callbacks);
	const resolve = async (specifier: string) => {
		for (const callback of callbacks.resolveCallbacks) {
			const result = await callback({ path: specifier });
			if (result) return result;
		}
		return undefined;
	};
	assert.deepEqual(await resolve('/assets/vendors/react.js'), {
		path: '/assets/vendors/react.js',
		external: true,
	});
	assert.equal(await resolve('/assets/vendors/other.js'), undefined);
	assert.deepEqual(
		await resolve('react'),
		{
			path: '/assets/vendors/react.js',
			external: true,
		},
		'alias filter still matches plain specifiers',
	);
});

test('createBrowserRuntimePlugin with matchPublicPaths: false skips /-prefixed resolves', async () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({
		manifest,
		name: 'no-public-paths',
		matchPublicPaths: false,
	});
	setupPlugin(plugin, callbacks);
	const resolve = async (specifier: string) => {
		for (const callback of callbacks.resolveCallbacks) {
			const result = await callback({ path: specifier });
			if (result) return result;
		}
		return undefined;
	};
	assert.deepEqual(
		await resolve('react'),
		{
			path: '/assets/vendors/react.js',
			external: true,
		},
		'alias filter still active',
	);
	assert.equal(await resolve('/assets/vendors/react.js'), undefined, 'no publicPath hook registered');
});

test('createBrowserRuntimePlugin onLoad rewrites JS/TS sources that import manifest specifiers', async () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-unified-rewrite-'));
	const filePath = path.join(tempDir, 'entry.tsx');
	writeFileSync(filePath, "import React from 'react';\n", 'utf-8');

	try {
		const callbacks = captureCallbacks();
		const plugin = createBrowserRuntimePlugin({ manifest });
		setupPlugin(plugin, callbacks);
		assert.equal(callbacks.loadCallbacks.length, 1);
		assert.deepEqual(await callbacks.loadCallbacks[0]?.({ path: filePath }), {
			contents: "import React from '/assets/vendors/react.js';\n",
			loader: 'tsx',
			resolveDir: tempDir,
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimePlugin onLoad short-circuits when the source has no manifest specifier', async () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-unified-rewrite-'));
	const filePath = path.join(tempDir, 'entry.tsx');
	writeFileSync(filePath, "import { foo } from 'local-package';\n", 'utf-8');

	try {
		const callbacks = captureCallbacks();
		const plugin = createBrowserRuntimePlugin({ manifest });
		setupPlugin(plugin, callbacks);
		assert.equal(callbacks.loadCallbacks.length, 1);
		assert.equal(await callbacks.loadCallbacks[0]?.({ path: filePath }), undefined);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimePlugin onLoad returns undefined for non-absolute paths', async () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest });
	setupPlugin(plugin, callbacks);
	assert.equal(callbacks.loadCallbacks.length, 1);
	assert.equal(await callbacks.loadCallbacks[0]?.({ path: 'virtual:entry' }), undefined);
});
