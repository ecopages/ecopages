import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ConfigBuilder } from '../../config/config-builder.ts';
import {
	getServerBundleOutputPaths,
	resolveProductionServerEntry,
} from '../../build/cache/server-entry-build-cache.ts';
import { SERVER_BUNDLE_FILENAME } from '../../utils/resolve-entry-file.ts';
import { ServerStaticBuilder } from './server-static-builder.ts';
import type { RouteRegistry } from '../../router/server/route-registry.ts';
import type { StaticGenerationRendererResolver } from '../../route-renderer/route-renderer.ts';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';

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
});
