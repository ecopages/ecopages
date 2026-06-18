import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), 'rolldown-adapter-test-'));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function writeFixture(filename: string, source: string): string {
	const fullPath = path.join(workDir, filename);
	writeFileSync(fullPath, source);
	return fullPath;
}

function writeAppPackageJson(fields: Record<string, unknown> = {}): void {
	writeFixture(
		'package.json',
		JSON.stringify(
			{
				name: 'test-app',
				private: true,
				...fields,
			},
			null,
			2,
		),
	);
}

describe('RolldownBuildAdapter', () => {
	test('builds a single entrypoint and reports outputs', async () => {
		const entrypoint = writeFixture('index.ts', 'export const answer = 42;\n');
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		assert.ok(firstOutput.path.startsWith(outdir), 'output path is under outdir');
		assert.ok(firstOutput.path.endsWith('.js'), `browser output has .js extension, got: ${firstOutput.path}`);
		assert.ok(
			readFileSync(firstOutput.path, 'utf-8').includes('answer'),
			'bundled output contains exported symbol',
		);
	});

	test('externalPackages keeps bare package imports external', async () => {
		writeAppPackageJson({ dependencies: { react: '^19.0.0' } });
		const entrypoint = writeFixture('entry.ts', "import { useState } from 'react';\nexport { useState };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		expect(code).toMatch(/from ['"]react['"]/);
	});

	test('externalPackages still bundles source-export package imports', async () => {
		const packageDir = path.join(workDir, 'node_modules', 'source-pkg');
		const packageEntrypoint = path.join(packageDir, 'shell.tsx');
		writeAppPackageJson({ dependencies: { 'source-pkg': '1.0.0' } });
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({
				name: 'source-pkg',
				type: 'module',
				exports: './shell.tsx',
			}),
		);
		writeFileSync(packageEntrypoint, "export const shell = 'bundled-source-package';\n");
		const entrypoint = writeFixture('entry.ts', "import { shell } from 'source-pkg';\nexport { shell };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		expect(code).not.toMatch(/from ['"]source-pkg['"]/);
		expect(code).toContain('bundled-source-package');
	});

	test('externalPackages bundles undeclared transitive dependencies (tier 3 — pnpm strict hoisting)', async () => {
		// Simulate a transitive dep that the app has NOT declared in its package.json.
		// Under pnpm strict hoisting, such packages are unreachable as bare specifiers
		// from build output dirs (.eco/, .server-route-modules/, dist/.server/), so
		// shouldBundlePackageImport must bundle them unconditionally (tier 3).
		const packageDir = path.join(workDir, 'node_modules', 'transitive-pkg');
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({
				name: 'transitive-pkg',
				type: 'module',
				exports: './index.js',
			}),
		);
		writeFileSync(path.join(packageDir, 'index.js'), "export const value = 'from-transitive-dep';\n");

		// App package.json deliberately does NOT declare 'transitive-pkg'.
		writeAppPackageJson({});

		const entrypoint = writeFixture(
			'entry.ts',
			"import { value } from 'transitive-pkg';\nexport { value };\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		// The transitive dep must be inlined — NOT left as a bare specifier.
		expect(code).not.toMatch(/from ['"]transitive-pkg['"]/);
		expect(code).toContain('from-transitive-dep');
	});

	test('externalPackages rewrites undeclared core-owned runtime packages to file URLs', async () => {
		const entrypoint = writeFixture('entry.ts', "import { parseSync } from 'oxc-parser';\nexport { parseSync };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const localRequire = createRequire(import.meta.url);
		const expectedRuntimeUrl = pathToFileURL(localRequire.resolve('oxc-parser')).href;

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		expect(code).not.toMatch(/from ['"]oxc-parser['"]/);
		expect(code).toContain(expectedRuntimeUrl);
	});

	test('externalPackages does not externalize plugin-owned virtual modules', async () => {
		const entrypoint = writeFixture(
			'virtual-entry.ts',
			"import { image } from 'ecopages:images';\nexport const src = image.src;\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			externalPackages: true,
			root: workDir,
			plugins: [
				{
					name: 'virtual-images',
					setup(build) {
						build.module('ecopages:images', () => ({
							loader: 'object',
							exports: {
								image: { src: '/images/example.png' },
							},
						}));
					},
				},
			],
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		expect(code).not.toMatch(/from ['"]ecopages:images['"]/);
		expect(code).toContain('/images/example.png');
	});

	test('rewrites OXC runtime helper imports to resolved file URLs', async () => {
		const entrypoint = writeFixture(
			'oxc-runtime-entry.ts',
			"import decorate from '@oxc-project/runtime/helpers/decorate';\nexport { decorate };\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		expect(code).toContain('decorate');
		expect(code).not.toMatch(/@oxc-project\/runtime\/helpers\/decorate/);
	});

	test('preserves the .js extension when a naming template is supplied', async () => {
		const entrypoint = writeFixture('base-layout.script.ts', "export const tag = 'layout';\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'browser',
			format: 'esm',
			naming: '[name]-[hash].[ext]',
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		assert.ok(
			firstOutput.path.endsWith('.js'),
			`naming-template output has .js extension, got: ${firstOutput.path}`,
		);
		assert.ok(
			firstOutput.path.includes('base-layout.script-'),
			`naming-template output keeps base-layout.script- prefix, got: ${firstOutput.path}`,
		);
	});

	test('preserves a literal naming value without double extension', async () => {
		const entrypoint = writeFixture('vendor.js', "export const tag = 'vendor';\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'browser',
			format: 'esm',
			naming: 'vendor.js',
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		assert.ok(
			firstOutput.path.endsWith('vendor.js') && !firstOutput.path.endsWith('vendor.js.js'),
			`literal naming keeps single .js extension, got: ${firstOutput.path}`,
		);
	});

	test('populates dependency graph from entry chunk moduleIds', async () => {
		writeFixture('helper.ts', "export function helper(): string { return 'h'; }\n");
		const entrypoint = writeFixture(
			'index.ts',
			"import { helper } from './helper.ts';\nexport const greet = helper();\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [entrypoint],
			outdir,
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.dependencyGraph, 'dependency graph present');
		const entrypoints = result.dependencyGraph?.entrypoints ?? {};
		const entryKeys = Object.keys(entrypoints);
		assert.ok(entryKeys.length > 0, 'at least one entrypoint in graph');
		const modulesForEntry = entrypoints[entryKeys[0]!] ?? [];
		assert.ok(
			modulesForEntry.some((modulePath) => modulePath.endsWith('helper.ts')),
			'graph includes the imported helper module',
		);
	});

	test('rejects with normalized logs on entrypoint that does not exist', async () => {
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			entrypoints: [path.join(workDir, 'does-not-exist.ts')],
			outdir,
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		assert.equal(result.success, false);
		assert.ok(result.logs.length > 0, 'has at least one log entry');
		assert.ok(result.outputs.length === 0, 'no outputs on failure');
	});

	test('getTranspileOptions returns the shared transpile defaults', () => {
		const adapter = new RolldownBuildAdapter();
		assert.deepEqual(adapter.getTranspileOptions('browser-script'), {
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
		});
		assert.deepEqual(adapter.getTranspileOptions('hmr-runtime'), {
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
		});
		assert.deepEqual(adapter.getTranspileOptions('hmr-entrypoint'), {
			target: 'browser',
			format: 'esm',
			sourcemap: 'none',
		});
	});

	test('resolve delegates to node module resolution from the supplied root', () => {
		const adapter = new RolldownBuildAdapter();
		const resolved = adapter.resolve('node:path', workDir);
		assert.ok(resolved.includes('path'), `expected resolved path to include "path", got: ${resolved}`);
	});

	test('buildOrThrow surfaces a thrown error before being caught by build()', async () => {
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const buildSpy = vi.spyOn(adapter, 'buildOrThrow');
		buildSpy.mockRejectedValueOnce(new Error('forced failure'));

		const result = await adapter.build({
			entrypoints: [],
			outdir,
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		assert.equal(result.success, false);
		assert.deepEqual(result.logs, [{ message: 'forced failure' }]);
		assert.equal(result.outputs.length, 0);
		buildSpy.mockRestore();
	});
});
