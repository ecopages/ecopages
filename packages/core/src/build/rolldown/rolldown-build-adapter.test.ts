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
import { createBrowserRuntimeManifest } from '../browser/browser-runtime-manifest.ts';
import { createBrowserRuntimePlugin } from '../browser/browser-runtime-plugin.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';

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
	test('bundles the exported server-only predicate for the browser without Node dependencies', async () => {
		const predicatePath = createRequire(import.meta.url).resolve(
			'@ecopages/core/build/contracts/server-only-specifier',
		);
		const entrypoint = writeFixture(
			'entry.ts',
			`export { isServerOnlyModuleSpecifier } from ${JSON.stringify(predicatePath)};`,
		);
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser' as const,
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
			environment: 'browser' as const,
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
			environment: 'server' as const,
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
			environment: 'server' as const,
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

	test('externalPackages points undeclared core-owned runtime packages at paths relative to the output', async () => {
		const entrypoint = writeFixture('entry.ts', "import { parseSync } from 'oxc-parser';\nexport { parseSync };\n");
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const localRequire = createRequire(import.meta.url);

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
		expect(code).not.toContain('file:');
		expect(code).toContain(`from "${relativeImportPath(firstOutput.path, localRequire.resolve('oxc-parser'))}"`);
	});

	test('externalPackages resolves undeclared core-owned packages with ESM conditions', async () => {
		const entrypoint = writeFixture(
			'entry.ts',
			"import { SchemaError } from '@standard-schema/utils';\nexport { SchemaError };\n",
		);

		const result = await new RolldownBuildAdapter().build({
			environment: 'server' as const,
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
			environment: 'server' as const,
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
			environment: 'server' as const,
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
			environment: 'server' as const,
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
			environment: 'server' as const,
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

	test('inlines OXC runtime helper imports', async () => {
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
		expect(code).not.toContain('file:');
	});

	test('does not rewrite hashed browser outputs after the bundler writes them', async () => {
		const runtimePlugin = createBrowserRuntimePlugin({
			manifest: createBrowserRuntimeManifest([
				{
					specifier: 'react',
					owner: '@ecopages/react',
					importPath: 'react',
					publicPath: '/assets/vendors/react.js',
				},
			]),
		});
		assert.ok(runtimePlugin);
		const entrypoint = writeFixture('entry.ts', "import React from 'react';\nexport { React };\n");
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
			plugins: [runtimePlugin],
		});

		assert.equal(result.success, true, JSON.stringify(result.logs));
		const hashedOutputs = result.outputs.filter((output) =>
			/-[A-Za-z0-9_-]+\.js$/u.test(path.basename(output.path)),
		);
		expect(hashedOutputs.length).toBeGreaterThan(0);
		const hashedCode = readFileSync(hashedOutputs[0]!.path, 'utf-8');
		expect(hashedCode).toMatch(/from ['"]\/assets\/vendors\/react\.js['"]/);
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

	test('retains inlined and unused imports in the source dependency closure', async () => {
		const dependency = writeFixture('constant.js', "export const value = 'inlined';\n");
		const unused = writeFixture('unused.js', "export const unused = 'unused';\n");
		const entry = writeFixture(
			'entry.js',
			"import { value } from './constant.js';\nimport { unused } from './unused.js';\nexport const read = () => value;\n",
		);
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser' as const,
			entrypoints: [entry],
			root: workDir,
			outdir: path.join(workDir, 'dist'),
			target: 'browser',
			format: 'esm',
		});
		expect(result.success).toBe(true);
		expect(result.dependencyGraph?.entrypoints[realpathSync(entry)]).toEqual(
			expect.arrayContaining([realpathSync(dependency), realpathSync(unused)]),
		);
	});

	test('populates dependency graph from the source module graph', async () => {
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

	test('dependency graph includes modules split into shared and dynamic chunks', async () => {
		writeFixture('shared.ts', 'export const layout = (body: string): string => `<main>${body}</main>`;\n');
		writeFixture('lazy-dep.ts', "export const lazyValue = 'lazy';\n");
		writeFixture('lazy.ts', "import { lazyValue } from './lazy-dep.ts';\nexport const lazy = lazyValue;\n");
		const first = writeFixture(
			'first.ts',
			"import { layout } from './shared.ts';\nexport const render = () => layout('first');\nexport const load = () => import('./lazy.ts');\n",
		);
		const second = writeFixture(
			'second.ts',
			"import { layout } from './shared.ts';\nimport { lazyValue } from './lazy-dep.ts';\nexport const render = () => layout(lazyValue);\n",
		);
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'server' as const,
			entrypoints: [first, second],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			splitting: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		const modulesOf = (entry: string) =>
			(result.dependencyGraph?.entrypoints[realpathSync(entry)] ?? []).map((modulePath) =>
				path.basename(modulePath),
			);
		expect(modulesOf(first)).toEqual(expect.arrayContaining(['first.ts', 'shared.ts', 'lazy.ts', 'lazy-dep.ts']));
		expect(modulesOf(second)).toEqual(expect.arrayContaining(['second.ts', 'shared.ts']));
		expect(modulesOf(second)).not.toContain('lazy.ts');
	});

	test('dependency graph walks chunks that import each other', async () => {
		const first = writeFixture(
			'first.ts',
			"export const name = 'first';\nexport const load = () => import('./second.ts');\n",
		);
		const second = writeFixture(
			'second.ts',
			"import { name } from './first.ts';\nexport const label = `${name}-second`;\n",
		);
		const adapter = new RolldownBuildAdapter();

		const result = await adapter.build({
			environment: 'server' as const,
			entrypoints: [first, second],
			outdir: path.join(workDir, 'dist'),
			target: 'node',
			format: 'esm',
			splitting: true,
			root: workDir,
		});

		assert.equal(result.success, true);
		for (const entry of [first, second]) {
			const modules = (result.dependencyGraph?.entrypoints[realpathSync(entry)] ?? []).map((modulePath) =>
				path.basename(modulePath),
			);
			expect(modules).toEqual(expect.arrayContaining(['first.ts', 'second.ts']));
		}
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
					setup(build) {
						build.transform({ filter: /index\.ts$/ }, () => {
							throw new Error('transform boom');
						});
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

	test('a transform that inserts a line returns a map that points at the original source', async () => {
		const entrypoint = writeFixture('page.ts', 'export const value = 1;\n');
		const adapter = new RolldownBuildAdapter();
		const outdir = path.join(workDir, 'dist');
		const result = await adapter.build({
			environment: 'server' as const,
			entrypoints: [entrypoint],
			outdir,
			target: 'es2022',
			format: 'esm',
			root: workDir,
			sourcemap: 'linked',
			plugins: [
				{
					name: 'insert-line',
					setup(build) {
						build.transform({ filter: /page\.ts$/ }, (code, id) => ({
							code: `void 0;\n${code}`,
							map: {
								version: 3,
								file: 'page.ts',
								sources: [id],
								sourcesContent: [code],
								names: [],
								mappings: ';AAAA',
							},
						}));
					},
				},
			],
		});

		assert.equal(result.success, true);
		const mapPath = result.outputs.find((output) => output.path.endsWith('.map'))?.path;
		assert.ok(mapPath, 'expected a source map artifact');
		const map = JSON.parse(readFileSync(mapPath, 'utf-8')) as { sources: string[]; mappings: string };
		assert.ok(
			map.sources.some((source) => source.includes('page.ts')),
			`expected original page.ts in map sources, got: ${map.sources.join(', ')}`,
		);
		assert.notEqual(map.mappings, '');
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
});
