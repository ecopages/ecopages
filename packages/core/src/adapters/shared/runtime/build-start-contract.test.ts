import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import {
	assertProductionConfigIdentity,
	getServerBundleOutputPaths,
	lookupServerEntryBuildCache,
	resolveProductionServerEntry,
} from '../../../build/cache/server-entry-build-cache.ts';
import { resolveEcoConfigPath } from '../../../config/resolve-eco-config-path.ts';
import { EMITTED_ECO_CONFIG_FILENAME } from '../../../config/server-config-bundle.ts';
import { SERVER_BUNDLE_FILENAME } from '../../../utils/resolve-entry-file.ts';
import { ServerStaticBuilder } from './server-static-builder.ts';
import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { StaticGenerationRendererResolver } from '../../../route-renderer/route-renderer.ts';
import type { StaticSiteGenerator } from '../../../static-site-generator/static-site-generator.ts';

describe('build → start contract', () => {
	const tempDirs: string[] = [];
	const originalNodeEnv = process.env.NODE_ENV;
	const originalCwd = process.cwd();

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		process.chdir(originalCwd);
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	it('emits a runnable server bundle and manifest when needsServerBundle is true', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-build-start-contract-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		writeFileSync(path.join(rootDir, 'app.ts'), 'export const ready = true;\n', 'utf8');
		writeFileSync(
			path.join(rootDir, 'eco.config.ts'),
			`export default { rootDir: ${JSON.stringify(rootDir)} };\n`,
			'utf8',
		);

		const appConfig = await new ConfigBuilder().setRootDir(rootDir).setDistDir('dist').setWorkDir('.eco').build();

		const staticSiteGenerator = {
			run: async () => {},
		} as unknown as StaticSiteGenerator;

		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
			needsServerBundle: true,
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const { serverEntryPath, manifestPath } = getServerBundleOutputPaths(appConfig);

		assert.equal(fileSystem.exists(serverEntryPath), true, 'expected dist/.server/app.mjs');
		assert.equal(fileSystem.exists(manifestPath), true, 'expected dist/.server/manifest.json');

		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			serverEntry: string;
			distDir: string;
		};
		assert.equal(manifest.serverEntry, SERVER_BUNDLE_FILENAME);
		assert.equal(path.resolve(manifest.distDir), path.resolve(appConfig.absolutePaths.distDir));

		const resolvedEntry = resolveProductionServerEntry(rootDir);
		assert.equal(resolvedEntry, serverEntryPath);
	});

	it('does not emit a server bundle for static-only apps', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-build-start-contract-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		writeFileSync(path.join(rootDir, 'app.ts'), 'export const ready = true;\n', 'utf8');

		const appConfig = await new ConfigBuilder().setRootDir(rootDir).setDistDir('dist').setWorkDir('.eco').build();

		const staticSiteGenerator = {
			run: async () => {},
		} as unknown as StaticSiteGenerator;

		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const { serverEntryPath, manifestPath } = getServerBundleOutputPaths(appConfig);

		assert.equal(fileSystem.exists(serverEntryPath), false, 'should not produce dist/.server/app.mjs');
		assert.equal(fileSystem.exists(manifestPath), false, 'should not produce dist/.server/manifest.json');

		const resolvedEntry = resolveProductionServerEntry(rootDir);
		assert.equal(resolvedEntry, undefined);
	});

	it('invalidates server entry cache when eco.config.ts content changes', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-build-start-contract-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		const entryPath = path.join(rootDir, 'app.ts');
		const configPath = path.join(rootDir, 'eco.config.ts');
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');
		writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(rootDir)} };\n`, 'utf8');

		const appConfig = await new ConfigBuilder().setRootDir(rootDir).setDistDir('dist').setWorkDir('.eco').build();

		const staticSiteGenerator = { run: async () => {} } as unknown as StaticSiteGenerator;
		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
			needsServerBundle: true,
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const cacheLookup1 = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.ok(cacheLookup1, 'expected initial cache hit');

		writeFileSync(
			configPath,
			`export default { rootDir: ${JSON.stringify(rootDir)}, baseUrl: 'http://updated.com' };\n`,
			'utf8',
		);

		const cacheLookup2 = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.equal(cacheLookup2, undefined, 'expected cache miss after config change');
	});

	it('preserves import.meta.dirname semantics in emitted dist/.server/eco.config.mjs', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-build-import-meta-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		const entryPath = path.join(rootDir, 'app.ts');
		const configPath = path.join(rootDir, 'eco.config.ts');
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');
		writeFileSync(
			configPath,
			`export default { rootDir: import.meta.dirname, baseUrl: 'http://test-import-meta.com' };\n`,
			'utf8',
		);

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setConfigModulePath(configPath)
			.setDistDir('dist')
			.setWorkDir('.eco')
			.build();

		const staticSiteGenerator = { run: async () => {} } as unknown as StaticSiteGenerator;
		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
			needsServerBundle: true,
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const { serverOutdir } = getServerBundleOutputPaths(appConfig);
		const emittedConfigPath = path.join(serverOutdir, EMITTED_ECO_CONFIG_FILENAME);
		assert.equal(fileSystem.exists(emittedConfigPath), true, 'emitted eco.config.mjs should exist');

		const importedModule = await import(pathToFileURL(emittedConfigPath).href);
		const configObj = importedModule.default ?? importedModule;
		assert.equal(
			configObj.rootDir,
			realpathSync(rootDir),
			'emitted config rootDir must resolve to source rootDir, not dist/.server',
		);
	});

	it('supports dist-only deployment and validates config identity', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-dist-only-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		const entryPath = path.join(rootDir, 'app.ts');
		const configPath = path.join(rootDir, 'eco.config.ts');
		const configSource = `export default { rootDir: import.meta.dirname, baseUrl: 'http://dist-only.com' };\n`;
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');
		writeFileSync(configPath, configSource, 'utf8');

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setConfigModulePath(configPath)
			.setDistDir('dist')
			.setWorkDir('.eco')
			.build();

		const staticSiteGenerator = { run: async () => {} } as unknown as StaticSiteGenerator;
		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
			needsServerBundle: true,
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const expectedEmittedConfig = path.join(rootDir, 'dist', '.server', EMITTED_ECO_CONFIG_FILENAME);
		const emittedConfigSource = readFileSync(expectedEmittedConfig, 'utf8');

		writeFileSync(configPath, `${configSource}\nexport const changedAfterBuild = true;\n`, 'utf8');
		assert.throws(() => {
			assertProductionConfigIdentity(rootDir, configPath, { isExplicitOverride: true });
		}, /Ecopages config mismatch/);
		writeFileSync(configPath, configSource, 'utf8');

		writeFileSync(expectedEmittedConfig, `${emittedConfigSource}\nexport const tampered = true;\n`, 'utf8');
		assert.throws(() => {
			assertProductionConfigIdentity(rootDir, expectedEmittedConfig);
		}, /Ecopages config mismatch/);
		writeFileSync(expectedEmittedConfig, emittedConfigSource, 'utf8');

		// Simulate dist-only deployment by removing the source eco.config.ts and app.ts
		rmSync(configPath);
		rmSync(entryPath);

		const resolvedConfigPath = resolveEcoConfigPath({ cwd: rootDir });
		assert.equal(resolvedConfigPath, expectedEmittedConfig);

		// Must not throw for standard bundled config deployment
		assert.doesNotThrow(() => {
			assertProductionConfigIdentity(rootDir, resolvedConfigPath);
		});

		// Explicit mismatch with a non-existent or different config should throw
		assert.throws(() => {
			assertProductionConfigIdentity(rootDir, path.join(rootDir, 'other.config.ts'), {
				isExplicitOverride: true,
			});
		}, /Ecopages config mismatch/);
	});

	it('invalidates server entry cache when imported dependency of eco.config.ts changes', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-dep-cache-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		const entryPath = path.join(rootDir, 'app.ts');
		const helperPath = path.join(rootDir, 'helper.ts');
		const configPath = path.join(rootDir, 'eco.config.ts');
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');
		writeFileSync(helperPath, 'export const siteName = "Ecopages V1";\n', 'utf8');
		writeFileSync(
			configPath,
			`import { siteName } from './helper.ts';\nexport default { rootDir: ${JSON.stringify(rootDir)}, baseUrl: siteName };\n`,
			'utf8',
		);

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setConfigModulePath(configPath)
			.setDistDir('dist')
			.setWorkDir('.eco')
			.build();

		const staticSiteGenerator = { run: async () => {} } as unknown as StaticSiteGenerator;
		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
			needsServerBundle: true,
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const cacheLookup1 = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.ok(cacheLookup1, 'expected initial cache hit');

		// Modify the helper imported by eco.config.ts
		writeFileSync(helperPath, 'export const siteName = "Ecopages V2";\n', 'utf8');

		const cacheLookup2 = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.equal(cacheLookup2, undefined, 'expected cache miss after imported config dependency change');
	});

	it('invalidates server entry cache when emitted eco.config.mjs is deleted', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-missing-output-'));
		tempDirs.push(rootDir);
		process.chdir(rootDir);

		const entryPath = path.join(rootDir, 'app.ts');
		const configPath = path.join(rootDir, 'eco.config.ts');
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');
		writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(rootDir)} };\n`, 'utf8');

		const appConfig = await new ConfigBuilder()
			.setRootDir(rootDir)
			.setConfigModulePath(configPath)
			.setDistDir('dist')
			.setWorkDir('.eco')
			.build();

		const staticSiteGenerator = { run: async () => {} } as unknown as StaticSiteGenerator;
		const builder = new ServerStaticBuilder({
			appConfig,
			staticSiteGenerator,
			serveOptions: { hostname: '127.0.0.1', port: 3000 },
			runtimeOrigin: 'http://127.0.0.1:3000',
			entryFile: 'app.ts',
			needsServerBundle: true,
		});

		await builder.build(undefined, {
			router: {} as RouteRegistry,
			routeRendererFactory: {} as StaticGenerationRendererResolver,
		});

		const cacheLookup1 = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.ok(cacheLookup1, 'expected initial cache hit');

		// Delete the emitted config bundle
		const { serverOutdir } = getServerBundleOutputPaths(appConfig);
		const emittedConfigPath = path.join(serverOutdir, EMITTED_ECO_CONFIG_FILENAME);
		rmSync(emittedConfigPath);

		const cacheLookup2 = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.equal(cacheLookup2, undefined, 'expected cache miss when one of the outputs is missing');
	});
});
