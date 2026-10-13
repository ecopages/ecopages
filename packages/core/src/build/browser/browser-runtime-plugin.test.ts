import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, test } from 'vitest';
import { createBrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import {
	BROWSER_RUNTIME_MANIFEST,
	DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
	createBrowserRuntimePlugin,
	getBrowserRuntimeManifestFromPlugin,
} from './browser-runtime-plugin.ts';
import type { EcoBuildOnLoadResult, EcoBuildOnResolveResult } from '../contracts/build-types.ts';
import { RolldownBuildAdapter } from '../rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../build-log.ts';

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
		transform() {},
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

test('createBrowserRuntimePlugin exposes the manifest', () => {
	const plugin = createBrowserRuntimePlugin({ manifest });
	assert.ok(plugin);
	assert.equal(getBrowserRuntimeManifestFromPlugin(plugin), manifest);
	assert.equal((plugin as Record<symbol, unknown>)[BROWSER_RUNTIME_MANIFEST], manifest);
});

test('createBrowserRuntimePlugin registers alias and publicPath resolves and no load hook', () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest });
	setupPlugin(plugin, callbacks);
	assert.equal(callbacks.resolveCallbacks.length, 2, 'alias + publicPath');
	assert.equal(callbacks.loadCallbacks.length, 0, 'no source rewrite');
});

test('createBrowserRuntimePlugin without matchPublicPaths registers the alias resolve only', () => {
	const callbacks = captureCallbacks();
	const plugin = createBrowserRuntimePlugin({ manifest, name: 'alias-only', matchPublicPaths: false });
	setupPlugin(plugin, callbacks);
	assert.equal(callbacks.resolveCallbacks.length, 1, 'alias only');
	assert.equal(callbacks.loadCallbacks.length, 0);
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

const workDirs: string[] = [];
afterEach(() => {
	for (const dir of workDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function buildBrowserEntry(source: string, runtimeManifest = manifest) {
	const dir = mkdtempSync(path.join(tmpdir(), 'ecopages-runtime-plugin-'));
	workDirs.push(dir);
	const entry = path.join(dir, 'entry.ts');
	writeFileSync(entry, source, 'utf-8');
	const plugin = createBrowserRuntimePlugin({ manifest: runtimeManifest });
	assert.ok(plugin);
	const result = await new RolldownBuildAdapter().build({
		environment: 'browser',
		entrypoints: [entry],
		outdir: path.join(dir, 'dist'),
		root: dir,
		target: 'browser',
		format: 'esm',
		splitting: false,
		plugins: [plugin],
	});
	return { result, code: result.success ? readFileSync(result.outputs[0]!.path, 'utf-8') : '' };
}

test.each([
	['a static import', "import React from 'react';\nexport const value = React;\n", '/assets/vendors/react.js'],
	['a side-effect import', "import 'react-dom/client';\n", '/assets/vendors/react-dom.js'],
	['a named re-export', "export { createRoot } from 'react-dom/client';\n", '/assets/vendors/react-dom.js'],
	['a star re-export', "export * from 'react';\n", '/assets/vendors/react.js'],
	['a dynamic import', "export const load = () => import('react');\n", '/assets/vendors/react.js'],
])(
	'createBrowserRuntimePlugin leaves %s of a manifest specifier as its public URL',
	async (_form, source, publicPath) => {
		const { result, code } = await buildBrowserEntry(source);

		assertBuildSucceeded(result, 'Build failed');
		assert.match(
			code,
			new RegExp(
				`from ['"]${publicPath.replaceAll('/', '\\/')}['"]|import\\(['"]${publicPath.replaceAll('/', '\\/')}['"]\\)|import ['"]${publicPath.replaceAll('/', '\\/')}['"]`,
			),
		);
	},
);

test('createBrowserRuntimePlugin does not map a package subpath the manifest does not list', async () => {
	const scopedManifest = createBrowserRuntimeManifest([
		{
			specifier: '@acme/ui',
			owner: '@ecopages/react',
			importPath: '@acme/ui',
			publicPath: '/assets/vendors/acme-ui.js',
		},
	]);

	const { result, code } = await buildBrowserEntry(
		"import { Button } from '@acme/ui/button';\nexport { Button };\n",
		scopedManifest,
	);

	assertBuildSucceeded(result, 'Build failed');
	assert.match(code, /@acme\/ui\/button/);
	assert.doesNotMatch(code, /acme-ui\.js/);
});
