import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test } from 'vitest';
import { createBrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import {
	collectBrowserRuntimeImportRewriteMap,
	createBrowserRuntimeImportRewritePlugin,
	rewriteBrowserRuntimeImports,
} from './browser-runtime-import-rewrite-plugin.ts';
import type { EcoBuildOnLoadResult } from './build-types.ts';

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

const specifierMap = new Map(manifest.assets.map((asset) => [asset.specifier, asset.publicPath]));

test('rewriteBrowserRuntimeImports rewrites static imports and re-exports', () => {
	const code = [
		"import React from 'react';",
		'export { createRoot } from "react-dom/client";',
		'export * from "react";',
	].join('\n');

	assert.equal(
		rewriteBrowserRuntimeImports(code, specifierMap),
		[
			"import React from '/assets/vendors/react.js';",
			'export { createRoot } from "/assets/vendors/react-dom.js";',
			'export * from "/assets/vendors/react.js";',
		].join('\n'),
	);
});

test('rewriteBrowserRuntimeImports rewrites string-literal dynamic imports', () => {
	assert.equal(
		rewriteBrowserRuntimeImports('const react = await import("react");', specifierMap),
		'const react = await import("/assets/vendors/react.js");',
	);
});

test('rewriteBrowserRuntimeImports does not rewrite ordinary strings or unknown imports', () => {
	const code = [
		'const sample = "import React from \'react\'";',
		'const name = "react";',
		'import { value } from "local-package";',
	].join('\n');

	assert.equal(rewriteBrowserRuntimeImports(code, specifierMap), code);
});

test('createBrowserRuntimeImportRewritePlugin returns null for an empty manifest', () => {
	assert.equal(createBrowserRuntimeImportRewritePlugin({ manifest: createBrowserRuntimeManifest() }), null);
});

test('createBrowserRuntimeImportRewritePlugin exposes rewrite mappings for generated output rewrites', () => {
	const plugin = createBrowserRuntimeImportRewritePlugin({ manifest });

	assert.ok(plugin);
	assert.deepEqual(Array.from(collectBrowserRuntimeImportRewriteMap([plugin]).entries()), [
		['react', '/assets/vendors/react.js'],
		['react-dom/client', '/assets/vendors/react-dom.js'],
	]);
});

test('createBrowserRuntimeImportRewritePlugin rewrites loaded source modules', async () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-runtime-rewrite-'));
	const filePath = path.join(tempDir, 'entry.tsx');
	writeFileSync(filePath, "import React from 'react';\n", 'utf-8');

	try {
		const resolveCallbacks: Array<
			(args: {
				path: string;
			}) =>
				| { path: string; external: boolean }
				| undefined
				| Promise<{ path: string; external: boolean } | undefined>
		> = [];
		const loadCallbacks: Array<
			(args: { path: string }) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>
		> = [];
		const plugin = createBrowserRuntimeImportRewritePlugin({ manifest });

		assert.ok(plugin);
		plugin.setup({
			onResolve(_options, callback) {
				resolveCallbacks.push(callback as (typeof resolveCallbacks)[number]);
			},
			onLoad(_options, callback) {
				loadCallbacks.push(callback);
			},
			module() {},
		});

		const resolve = async (specifier: string) => {
			for (const callback of resolveCallbacks) {
				const result = await callback({ path: specifier });
				if (result) {
					return result;
				}
			}

			return undefined;
		};

		assert.equal(resolveCallbacks.length, 2);
		assert.deepEqual(await resolve('react'), {
			path: '/assets/vendors/react.js',
			external: true,
		});
		assert.deepEqual(await resolve('/assets/vendors/react.js'), {
			path: '/assets/vendors/react.js',
			external: true,
		});
		assert.equal(await resolve('/assets/vendors/other.js'), undefined);
		assert.equal(loadCallbacks.length, 1);
		assert.deepEqual(await loadCallbacks[0]?.({ path: filePath }), {
			contents: "import React from '/assets/vendors/react.js';\n",
			loader: 'tsx',
			resolveDir: tempDir,
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test('createBrowserRuntimeImportRewritePlugin returns ts loader for rewritten .mts modules', async () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-runtime-rewrite-'));
	const filePath = path.join(tempDir, 'entry.mts');
	writeFileSync(filePath, "import React from 'react';\nconst value: number = 1;\n", 'utf-8');

	try {
		const loadCallbacks: Array<
			(args: { path: string }) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>
		> = [];
		const plugin = createBrowserRuntimeImportRewritePlugin({ manifest });

		assert.ok(plugin);
		plugin.setup({
			onResolve() {},
			onLoad(_options, callback) {
				loadCallbacks.push(callback);
			},
			module() {},
		});

		assert.equal(loadCallbacks.length, 1);
		assert.deepEqual(await loadCallbacks[0]?.({ path: filePath }), {
			contents: "import React from '/assets/vendors/react.js';\nconst value: number = 1;\n",
			loader: 'ts',
			resolveDir: tempDir,
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
