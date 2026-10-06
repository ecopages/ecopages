import assert from 'node:assert/strict';
import { createRequire, SourceMap } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import { createEcoComponentMetaTransform } from '../../plugins/eco-component-meta-plugin.ts';
import { createEcoBuildPluginFromSourceTransform } from '../../plugins/source-transform.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

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
	test('bundles the exported server-only predicate for the browser without Node dependencies', async () => {
		const predicatePath = createRequire(import.meta.url).resolve(
			'@ecopages/core/build/contracts/server-only-specifier',
		);
		const entrypoint = writeFixture(
			'entry.ts',
			`export { isServerOnlyModuleSpecifier } from ${JSON.stringify(predicatePath)};`,
		);
		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		expect(result.success, JSON.stringify(result.logs)).toBe(true);
		expect(readFileSync(result.outputs[0]!.path, 'utf8')).toContain('isServerOnlyModuleSpecifier');
	});

	test.each([
		"import { secret } from './db.server.ts'; export { secret };",
		"export { secret } from './db.server';",
		"export const load = () => import('./db.server.ts');",
		"import './db.server.ts'; export const ready = true;",
		"export { secret } from './db.server?raw';",
		"export { secret } from './db.server#module';",
	])('rejects server-only browser imports and names the importer: %s', async (source) => {
		writeFixture('db.server.ts', 'export const secret = "server-secret";');
		const entrypoint = writeFixture('lit-browser.ts', source);
		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{
					name: 'query-module-resolver',
					setup(build) {
						build.onResolve({ filter: /\.server[?#]/ }, () => ({
							path: path.join(workDir, 'db.server.ts'),
						}));
					},
				},
			],
		});

		expect(result.success).toBe(false);
		expect(result.logs.map((log) => log.message).join('\n')).toContain('server-only');
		expect(result.logs.map((log) => log.message).join('\n')).toContain(entrypoint);
	});

	test('allows server-only imports in server builds', async () => {
		writeFixture('db.server.ts', 'export const secret = "server-secret";');
		const entrypoint = writeFixture('entry.ts', "export { secret } from './db.server.ts';");
		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			root: workDir,
		});

		expect(result.success).toBe(true);
		expect(readFileSync(result.outputs[0]!.path, 'utf8')).toContain('server-secret');
	});

	test('builds a single entrypoint and reports outputs', async () => {
		const entrypoint = writeFixture('index.ts', 'export const answer = 42;\n');
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			environment: 'browser' as const,
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
			environment: 'server' as const,
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
			environment: 'server' as const,
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

		const entrypoint = writeFixture('entry.ts', "import { value } from 'transitive-pkg';\nexport { value };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			environment: 'server' as const,
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

	test('externalPackages keeps node builtins external for node-target builds', async () => {
		const entrypoint = writeFixture(
			'node-builtin-entry.ts',
			"import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			environment: 'server' as const,
			entrypoints: [entrypoint],
			outdir,
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const code = readFileSync(result.outputs[0]!.path, 'utf-8');
		expect(code).toMatch(/from ['"]node:fs['"]/);
	});

	test('externalPackages rewrites undeclared core-owned runtime packages to file URLs', async () => {
		const entrypoint = writeFixture('entry.ts', "import { parseSync } from 'oxc-parser';\nexport { parseSync };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const localRequire = createRequire(import.meta.url);
		const expectedRuntimeUrl = pathToFileURL(localRequire.resolve('oxc-parser')).href;

		const result = await adapter.build({
			environment: 'server' as const,
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

	test('externalPackages bundles Core runtime dependencies with CommonJS named exports', async () => {
		const entrypoint = writeFixture(
			'entry.ts',
			"import { WebSocketServer } from 'ws';\nexport { WebSocketServer };\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const localRequire = createRequire(import.meta.url);
		const nodeModulesDir = path.join(workDir, 'node_modules');
		mkdirSync(nodeModulesDir, { recursive: true });
		symlinkSync(path.dirname(localRequire.resolve('ws')), path.join(nodeModulesDir, 'ws'), 'dir');
		const result = await adapter.build({
			environment: 'server' as const,
			entrypoints: [entrypoint],
			outdir,
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		assert.ok(result.outputs.length > 0, 'at least one output file');
		const firstOutput = result.outputs[0]!;
		const code = readFileSync(firstOutput.path, 'utf-8');
		expect(code).not.toMatch(/from ['"]ws['"]/);
		expect(code).not.toMatch(/from ['"]file:.*\/ws\/index\.js['"]/);
		expect(code).toContain('WebSocketServer');
	});

	test('externalPackages does not externalize plugin-owned virtual modules', async () => {
		const entrypoint = writeFixture(
			'virtual-entry.ts',
			"import { image } from 'ecopages:images';\nexport const src = image.src;\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			environment: 'server' as const,
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
			environment: 'server' as const,
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
			environment: 'browser' as const,
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
			environment: 'browser' as const,
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

	test('splitting: false inlines dynamic imports for single-entrypoint browser builds', async () => {
		writeFixture('lazy-dep.ts', "export const value = 'lazy-value';\n");
		const entrypoint = writeFixture(
			'entry.ts',
			"export async function load() {\n  const mod = await import('./lazy-dep.ts');\n  return mod.value;\n}\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir,
			target: 'browser',
			format: 'esm',
			root: workDir,
			splitting: false,
		});

		assert.equal(result.success, true);
		const entryOutputPath =
			result.entryOutputs?.[path.resolve(entrypoint)] ??
			result.outputs.find((output) => output.path.endsWith('entry.js'))?.path ??
			result.outputs[0]!.path;
		const code = readFileSync(entryOutputPath, 'utf-8');
		expect(code).toContain('lazy-value');
		expect(code).not.toMatch(/import\(['"]\.\/lazy-dep/);
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
			environment: 'browser' as const,
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
			environment: 'browser' as const,
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

	test('keeps the code, file and location of a syntax error', async () => {
		const entrypoint = realpathSync(writeFixture('broken.ts', 'export const value = ;\n'));
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		assert.equal(result.success, false);
		expect(result.logs).toHaveLength(1);
		expect(result.logs[0]).toMatchObject({
			code: 'PARSE_ERROR',
			id: entrypoint,
			loc: { file: entrypoint, line: 1 },
		});
		expect(result.logs[0]!.message).not.toContain('\u001b[');
	});

	test('attributes an error thrown by a bridged plugin to that plugin, with its file, frame and stack', async () => {
		const entrypoint = writeFixture('index.ts', "import './styles.eco';\n");
		const stylesheet = realpathSync(writeFixture('styles.eco', 'body {}\n'));
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{ name: 'first-loader', setup: () => undefined },
				{
					name: 'eco-loader',
					setup(build) {
						build.onLoad({ filter: /\.eco$/ }, () => {
							throw Object.assign(new Error('loader boom'), {
								loc: { file: stylesheet, line: 1, column: 0 },
								frame: '1: body {}',
							});
						});
					},
				},
			],
		});

		assert.equal(result.success, false);
		expect(result.logs).toHaveLength(1);
		expect(result.logs[0]).toMatchObject({
			code: 'PLUGIN_ERROR',
			plugin: 'eco-loader',
			hook: 'load',
			id: stylesheet,
			loc: { file: stylesheet, line: 1, column: 0 },
			frame: '1: body {}',
			message: 'loader boom',
		});
		expect(result.logs[0]!.stack).toContain('loader boom');
	});

	test('attributes an error thrown by a plugin transform to that plugin and file', async () => {
		const entrypoint = realpathSync(writeFixture('index.ts', 'export const answer = 42;\n'));
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{
					name: 'eco-transform',
					setup: () => undefined,
					transform: {
						filter: /index\.ts$/,
						handler() {
							throw new Error('transform boom');
						},
					},
				},
			],
		});

		assert.equal(result.success, false);
		expect(result.logs[0]).toMatchObject({ plugin: 'eco-transform', id: entrypoint, message: 'transform boom' });
	});

	test('attributes an error thrown by a bridged plugin setup to that plugin', async () => {
		const entrypoint = writeFixture('index.ts', 'export const answer = 42;\n');
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{
					name: 'broken-setup',
					setup() {
						throw new Error('setup boom');
					},
				},
			],
		});

		assert.equal(result.success, false);
		expect(result.logs[0]).toMatchObject({ plugin: 'broken-setup', message: 'setup boom' });
	});

	test('captures build warnings on the result', async () => {
		const entrypoint = realpathSync(writeFixture('index.ts', 'eval("1");\nexport const answer = 42;\n'));
		const adapter = new RolldownBuildAdapter();
		const printWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			const result = await adapter.build({
				environment: 'browser' as const,
				entrypoints: [entrypoint],
				outdir: path.join(workDir, 'dist'),
				target: 'browser',
				format: 'esm',
				root: workDir,
			});

			assert.equal(result.success, true);
			expect(result.warnings).toEqual([expect.objectContaining({ code: 'EVAL', id: entrypoint })]);
			expect(printWarning).toHaveBeenCalledWith(expect.stringContaining('eval'));
		} finally {
			printWarning.mockRestore();
		}
	});

	test('attributes the same thrown error to each file it fails, without changing it', async () => {
		const entrypoint = writeFixture('index.ts', "import './a.eco';\nimport './b.eco';\n");
		const files = ['a.eco', 'b.eco'].map((name) => realpathSync(writeFixture(name, 'body {}\n')));
		const shared = new Error('shared boom');
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{
					name: 'shared-loader',
					setup(build) {
						build.onLoad({ filter: /\.eco$/ }, () => {
							throw shared;
						});
					},
				},
			],
		});

		assert.equal(result.success, false);
		expect(result.logs.map((log) => log.id).sort()).toEqual(files);
		expect(result.logs.every((log) => log.plugin === 'shared-loader')).toBe(true);
		expect(Object.keys(shared)).toEqual([]);
	});

	test('attributes a frozen thrown error to its plugin', async () => {
		const entrypoint = writeFixture('index.ts', "import './styles.eco';\n");
		const stylesheet = realpathSync(writeFixture('styles.eco', 'body {}\n'));
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{
					name: 'frozen-loader',
					setup(build) {
						build.onLoad({ filter: /\.eco$/ }, () => {
							throw Object.freeze(new Error('frozen boom'));
						});
					},
				},
			],
		});

		expect(result.logs).toEqual([
			expect.objectContaining({ plugin: 'frozen-loader', id: stylesheet, message: 'frozen boom' }),
		]);
	});

	test('reports an AggregateError thrown by a plugin setup as one log for that plugin', async () => {
		const entrypoint = writeFixture('index.ts', 'export const answer = 42;\n');
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
			root: workDir,
			plugins: [
				{
					name: 'aggregate-setup',
					setup() {
						throw new AggregateError([new Error('first'), new Error('second')], 'setup failed twice');
					},
				},
			],
		});

		expect(result.logs).toEqual([
			expect.objectContaining({ plugin: 'aggregate-setup', message: 'setup failed twice' }),
		]);
	});

	test('attributes errors from onResolve and module() callbacks', async () => {
		const entrypoint = realpathSync(
			writeFixture('index.ts', "import 'virtual:broken';\nimport 'resolve:broken';\n"),
		);
		const adapter = new RolldownBuildAdapter();
		const build = (plugins: EcoBuildPlugin[]) =>
			adapter.build({
				environment: 'browser' as const,
				entrypoints: [entrypoint],
				outdir: path.join(workDir, 'dist'),
				target: 'browser',
				format: 'esm',
				root: workDir,
				plugins,
			});

		const resolveResult = await build([
			{
				name: 'virtual-provider',
				setup: (builder) => builder.module('virtual:broken', () => ({ contents: '' })),
			},
			{
				name: 'broken-resolver',
				setup(builder) {
					builder.onResolve({ filter: /^resolve:/ }, () => {
						throw new Error('resolve boom');
					});
				},
			},
		]);
		expect(resolveResult.logs).toEqual([
			expect.objectContaining({ plugin: 'broken-resolver', id: entrypoint, message: 'resolve boom' }),
		]);

		const moduleResult = await build([
			{
				name: 'broken-virtual',
				setup(builder) {
					builder.module('virtual:broken', () => {
						throw new Error('module boom');
					});
					builder.onResolve({ filter: /^resolve:/ }, () => ({ path: 'resolve:ok', external: true }));
				},
			},
		]);
		expect(moduleResult.logs).toEqual([
			expect.objectContaining({ plugin: 'broken-virtual', id: 'virtual:broken', message: 'module boom' }),
		]);
	});

	test('getTranspileOptions selects defaults by environment', () => {
		const adapter = new RolldownBuildAdapter();
		assert.deepEqual(adapter.getTranspileOptions('server'), {
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
		});
		assert.deepEqual(adapter.getTranspileOptions('browser'), {
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
			environment: 'browser' as const,
			entrypoints: [],
			outdir,
			target: 'browser',
			format: 'esm',
			root: workDir,
		});

		assert.equal(result.success, false);
		expect(result.logs).toEqual([expect.objectContaining({ message: 'forced failure' })]);
		assert.equal(result.outputs.length, 0);
		buildSpy.mockRestore();
	});

	test('a server build with the component metadata transform maps the server bundle back to the page source', async () => {
		const pagePath = writeFixture(
			'page.ts',
			[
				"import { eco } from '@ecopages/core';",
				'',
				'export default eco.page({',
				'\trender: () => {',
				"\t\tthrow new Error('page failed');",
				'\t},',
				'});',
				'',
			].join('\n'),
		);
		const config = {
			rootDir: workDir,
			integrations: [{ name: 'kitajs', extensions: ['.ts'], jsxImportSource: '@kitajs/html' }],
		} as unknown as EcoPagesAppConfig;
		const outdir = path.join(workDir, 'dist');

		const result = await new RolldownBuildAdapter().build({
			environment: 'server' as const,
			entrypoints: [pagePath],
			outdir,
			target: 'node',
			format: 'esm',
			sourcemap: 'hidden',
			external: ['@ecopages/core'],
			root: workDir,
			plugins: [createEcoBuildPluginFromSourceTransform(createEcoComponentMetaTransform({ config }))],
		});

		assert.equal(result.success, true, JSON.stringify(result.logs));
		const outputPath = result.outputs.find((output) => /\.m?js$/.test(output.path))?.path ?? '';
		const lines = readFileSync(outputPath, 'utf-8').split('\n');
		assert.ok(
			lines.some((line) => line.includes('bindComponentIdentity(')),
			'the page was attributed',
		);
		const line = lines.findIndex((text) => text.includes('page failed'));
		const entry = new SourceMap(JSON.parse(readFileSync(`${outputPath}.map`, 'utf-8'))).findEntry(
			line,
			lines[line]!.indexOf('throw'),
		);

		assert.ok('originalLine' in entry, 'the thrown statement has a mapping');
		assert.match(entry.originalSource, /page\.ts$/);
		assert.equal(entry.originalLine, 4);
	});
});
