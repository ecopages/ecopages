import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { appLogger } from '../../global/app-logger.ts';
import type { BuildOptions } from '../contracts/build-contracts.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), 'rolldown-adapter-test-'));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	rmSync(workDir, { recursive: true, force: true });
});

function writeFixture(filename: string, source: string): string {
	const fullPath = path.join(workDir, filename);
	writeFileSync(fullPath, source);
	return fullPath;
}

function relativeImportPath(outputPath: string, targetPath: string): string {
	return path
		.relative(path.dirname(realpathSync(outputPath)), targetPath)
		.split(path.sep)
		.join('/');
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

	test('externalPackages keeps compiled packages that a bundled workspace package imports external as relative paths', async () => {
		writeAppPackageJson({ type: 'module', dependencies: { 'source-lib': 'workspace:*' } });
		const writePackage = (dir: string, files: Record<string, string>): void => {
			mkdirSync(dir, { recursive: true });
			for (const [name, source] of Object.entries(files)) writeFileSync(path.join(dir, name), source);
		};
		writePackage(path.join(workDir, 'packages/source-lib'), {
			'package.json': JSON.stringify({ name: 'source-lib', type: 'module', exports: './index.ts' }),
			'index.ts':
				"import { loadBinding } from 'native-like';\nimport { shared } from 'shared-lib';\nexport const binding: { native: boolean } = loadBinding();\nexport { shared };\n",
		});
		writePackage(path.join(workDir, 'packages/shared-lib'), {
			'package.json': JSON.stringify({ name: 'shared-lib', type: 'module', exports: './index.js' }),
			'index.js': "export const shared = 'bundled-workspace-package';\n",
		});
		writePackage(path.join(workDir, 'node_modules/native-like'), {
			'package.json': JSON.stringify({ name: 'native-like', type: 'module', exports: './index.js' }),
			'index.js':
				"import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nexport const loadBinding = () => require(`./binding-${process.platform}.cjs`);\n",
			[`binding-${process.platform}.cjs`]: 'module.exports = { native: true };\n',
		});
		symlinkSync(path.join(workDir, 'packages/source-lib'), path.join(workDir, 'node_modules/source-lib'), 'dir');
		symlinkSync(path.join(workDir, 'packages/shared-lib'), path.join(workDir, 'node_modules/shared-lib'), 'dir');
		const entrypoint = writeFixture(
			'entry.ts',
			"import { binding, shared } from 'source-lib';\nexport { binding, shared };\n",
		);

		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		const outputPath = result.outputs[0]!.path;
		const code = readFileSync(outputPath, 'utf-8');
		const nativeEntry = path.join(realpathSync(workDir), 'node_modules/native-like/index.js');
		expect(code).toContain(`from "${relativeImportPath(outputPath, nativeEntry)}"`);
		expect(code).toContain('bundled-workspace-package');
		const loaded = execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`const m = await import(${JSON.stringify(pathToFileURL(outputPath).href)}); console.log(JSON.stringify(m.binding));`,
			],
			{ encoding: 'utf8' },
		);
		expect(JSON.parse(loaded)).toEqual({ native: true });
	});

	test('externalPackages keeps node builtins external for node-target builds', async () => {
		const entrypoint = writeFixture(
			'node-builtin-entry.ts',
			"import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
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

	test('externalPackages points undeclared core-owned runtime packages at paths relative to the output', async () => {
		const entrypoint = writeFixture('entry.ts', "import { parseSync } from 'oxc-parser';\nexport { parseSync };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const localRequire = createRequire(import.meta.url);

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
		expect(code).not.toContain('file:');
		expect(code).toContain(`from "${relativeImportPath(firstOutput.path, localRequire.resolve('oxc-parser'))}"`);
	});

	test('externalPackages resolves undeclared core-owned packages with ESM conditions', async () => {
		const entrypoint = writeFixture(
			'entry.ts',
			"import { SchemaError } from '@standard-schema/utils';\nexport { SchemaError };\n",
		);

		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		const code = readFileSync(result.outputs[0]!.path, 'utf-8');
		expect(code).toMatch(/from "\.\.?\/[^"]*@standard-schema\/utils\/dist\/index\.js"/);
		expect(code).not.toContain('index.cjs');
	});

	test('externalPackages keeps an app-declared core dependency a bare import', async () => {
		writeAppPackageJson({ dependencies: { 'oxc-parser': '*' } });
		const entrypoint = writeFixture('entry.ts', "import { parseSync } from 'oxc-parser';\nexport { parseSync };\n");

		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		expect(readFileSync(result.outputs[0]!.path, 'utf-8')).toMatch(/from ['"]oxc-parser['"]/);
	});

	async function buildWithCoreImports(imports: string[], options: Partial<BuildOptions> = {}) {
		const entrypoint = writeFixture(
			'entry.ts',
			imports.map((specifier, index) => `export * as dep${index} from '${specifier}';`).join('\n'),
		);
		return await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
			...options,
		});
	}

	test('a server entry build reports packages outside the app root in one line', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const entrypoint = writeFixture(
			'entry.ts',
			"import { parseSync } from 'oxc-parser';\nimport { Logger } from '@ecopages/logger';\nexport const lazy = () => import('oxc-parser');\nexport { parseSync, Logger };\n",
		);

		const result = await new RolldownBuildAdapter().build({
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			externalPackages: true,
			reportPackagesOutsideRoot: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		expect(warn).toHaveBeenCalledTimes(1);
		const message = String(warn.mock.calls[0]?.[0]);
		expect(message).toContain(
			'dist/entry.mjs imports 2 packages from outside the app folder (@ecopages/logger, oxc-parser)',
		);
		expect(message).toContain('docs/reference/deployment');
	});

	test('a server entry build names one outside package in the singular', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);

		const result = await buildWithCoreImports(['oxc-parser'], { reportPackagesOutsideRoot: true });

		assert.equal(result.success, true);
		expect(String(warn.mock.calls[0]?.[0])).toContain('imports 1 package from outside the app folder (oxc-parser)');
	});

	test('a server entry build names the first five outside packages and counts the rest', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);

		const result = await buildWithCoreImports(
			['@clack/prompts', '@ecopages/logger', '@standard-schema/utils', 'chokidar', 'oxc-parser', 'oxc-resolver'],
			{ reportPackagesOutsideRoot: true },
		);

		assert.equal(result.success, true);
		expect(String(warn.mock.calls[0]?.[0])).toContain(
			'6 packages from outside the app folder (@clack/prompts, @ecopages/logger, @standard-schema/utils, chokidar, oxc-parser and 1 more)',
		);
	});

	test('each server output reports its own complete list, named by the directory it runs from', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const staged = { outdir: path.join(workDir, 'staging'), runtimeOutdir: path.join(workDir, 'dist/.server') };

		await buildWithCoreImports(['oxc-parser'], {
			...staged,
			naming: 'eco.config.mjs',
			reportPackagesOutsideRoot: true,
		});
		await buildWithCoreImports(['@ecopages/logger', 'oxc-parser'], {
			...staged,
			naming: 'app.mjs',
			reportPackagesOutsideRoot: true,
		});

		expect(warn.mock.calls.map((call) => String(call[0]).split(';')[0])).toEqual([
			'dist/.server/eco.config.mjs imports 1 package from outside the app folder (oxc-parser)',
			'dist/.server/app.mjs imports 2 packages from outside the app folder (@ecopages/logger, oxc-parser)',
		]);
	});

	test('a production module build does not report packages outside the app root', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);

		const result = await buildWithCoreImports(['oxc-parser']);

		assert.equal(result.success, true);
		expect(warn).not.toHaveBeenCalled();
	});

	test('externalPackages rejects a nested chunk that imports a core-owned package path', async () => {
		const entrypoint = writeFixture('entry.ts', "import { parseSync } from 'oxc-parser';\nexport { parseSync };\n");

		const result = await new RolldownBuildAdapter().build({
			entrypoints: { 'nested/entry': entrypoint },
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			externalPackages: true,
			root: workDir,
		});

		assert.equal(result.success, false);
		expect(result.logs.map((log) => log.message).join('\n')).toContain('nested/entry');
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
		expect(code).not.toMatch(/from ['"][^'"]*\/ws\/index\.js['"]/);
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

	test('inlines OXC runtime helper imports', async () => {
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
		expect(code).not.toContain('file:');
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

	test('splitting: false inlines dynamic imports for single-entrypoint browser builds', async () => {
		writeFixture('lazy-dep.ts', "export const value = 'lazy-value';\n");
		const entrypoint = writeFixture(
			'entry.ts',
			"export async function load() {\n  const mod = await import('./lazy-dep.ts');\n  return mod.value;\n}\n",
		);
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');

		const result = await adapter.build({
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
