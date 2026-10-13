import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { EMITTED_ECO_CONFIG_FILENAME } from '../config/server-config-bundle.ts';
import {
	assertProductionConfigIdentity,
	getServerBundleOutputPaths,
	resolveProductionServerEntry,
	writeServerBundleDeployManifest,
} from './server-bundle-deploy-manifest.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../utils/resolve-entry-file.ts';

describe('server-bundle-deploy-manifest', () => {
	const tempDirs: string[] = [];
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		vi.restoreAllMocks();
		process.env.NODE_ENV = originalNodeEnv;
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	it('writes deploy manifest and resolves production entry from manifest', () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-server-entry-cache-'));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, 'dist');
		const workDir = path.join(rootDir, '.eco');
		fileSystem.ensureDir(distDir);
		fileSystem.ensureDir(workDir);

		const appConfig = {
			rootDir,
			distDir: 'dist',
			absolutePaths: {
				distDir,
				workDir,
			},
			processors: new Map(),
			integrations: [],
		} as unknown as EcoPagesAppConfig;

		const serverEntryPath = path.join(distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
		fileSystem.ensureDir(path.dirname(serverEntryPath));
		writeFileSync(serverEntryPath, 'export {};\n', 'utf8');

		writeServerBundleDeployManifest(appConfig, serverEntryPath);

		const { manifestPath } = getServerBundleOutputPaths(appConfig);
		assert.equal(fileSystem.exists(manifestPath), true);

		const resolved = resolveProductionServerEntry(rootDir);
		assert.equal(resolved, serverEntryPath);
	});

	/**
	 * @remarks
	 * `fileSystem.hash` is SHA-256 on every runtime; earlier releases used Bun's native hash under Bun, and the `bun` side
	 * swaps it for a numeric hash in that shape, so the test fails if the deploy manifest starts to depend on it.
	 */
	function useRuntimeHash(runtime: 'bun' | 'node'): void {
		vi.restoreAllMocks();
		if (runtime === 'bun') {
			vi.spyOn(fileSystem, 'hash').mockImplementation((filePath) =>
				BigInt(
					`0x${createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 16)}`,
				).toString(),
			);
		}
	}

	it.each([
		{ build: 'bun', check: 'node' },
		{ build: 'node', check: 'bun' },
		{ build: 'bun', check: 'bun' },
		{ build: 'node', check: 'node' },
	] as const)('accepts the config a $build build recorded when start checks it under $check', ({ build, check }) => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-config-identity-'));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, 'dist');
		const serverOutdir = path.join(distDir, SERVER_BUNDLE_DIR);
		fileSystem.ensureDir(serverOutdir);

		const configPath = path.join(rootDir, 'eco.config.ts');
		const emittedConfigPath = path.join(serverOutdir, EMITTED_ECO_CONFIG_FILENAME);
		const serverEntryPath = path.join(serverOutdir, SERVER_BUNDLE_FILENAME);
		writeFileSync(configPath, 'export default {};\n', 'utf8');
		writeFileSync(emittedConfigPath, 'export default { emitted: true };\n', 'utf8');
		writeFileSync(serverEntryPath, 'export {};\n', 'utf8');

		const appConfig = {
			rootDir,
			distDir: 'dist',
			absolutePaths: { distDir, config: configPath },
		} as unknown as EcoPagesAppConfig;

		useRuntimeHash(build);
		writeServerBundleDeployManifest(appConfig, serverEntryPath, {
			emittedConfigModule: EMITTED_ECO_CONFIG_FILENAME,
		});

		useRuntimeHash(check);
		assert.doesNotThrow(() => assertProductionConfigIdentity(rootDir, emittedConfigPath));
		assert.doesNotThrow(() => assertProductionConfigIdentity(rootDir, configPath, { isExplicitOverride: true }));

		writeFileSync(configPath, 'export default { changed: true };\n', 'utf8');
		assert.throws(
			() => assertProductionConfigIdentity(rootDir, configPath, { isExplicitOverride: true }),
			/Ecopages config mismatch/,
		);
	});

	function createBuiltApp(prefix: string, distDirName = 'dist') {
		const rootDir = mkdtempSync(path.join(tmpdir(), prefix));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, distDirName);
		const serverOutdir = path.join(distDir, SERVER_BUNDLE_DIR);
		fileSystem.ensureDir(serverOutdir);
		const configPath = path.join(rootDir, 'eco.config.ts');
		const emittedConfigPath = path.join(serverOutdir, EMITTED_ECO_CONFIG_FILENAME);
		const serverEntryPath = path.join(serverOutdir, SERVER_BUNDLE_FILENAME);
		writeFileSync(configPath, 'export default {};\n', 'utf8');
		writeFileSync(emittedConfigPath, 'export default { emitted: true };\n', 'utf8');
		writeFileSync(serverEntryPath, 'export {};\n', 'utf8');
		const appConfig = {
			rootDir,
			distDir: distDirName,
			absolutePaths: { distDir, config: configPath },
		} as unknown as EcoPagesAppConfig;
		writeServerBundleDeployManifest(appConfig, serverEntryPath, {
			emittedConfigModule: EMITTED_ECO_CONFIG_FILENAME,
		});
		return { rootDir, appConfig, serverOutdir, emittedConfigPath };
	}

	it('records no absolute path', () => {
		const { appConfig } = createBuiltApp('eco-deploy-manifest-paths-');
		const manifest = JSON.parse(readFileSync(getServerBundleOutputPaths(appConfig).manifestPath, 'utf8')) as Record<
			string,
			string
		>;

		assert.deepEqual(manifest, {
			serverEntry: SERVER_BUNDLE_FILENAME,
			sourceConfigRelativePath: 'eco.config.ts',
			emittedConfigModule: EMITTED_ECO_CONFIG_FILENAME,
			configHash: manifest.configHash,
			emittedConfigHash: manifest.emittedConfigHash,
		});
		assert.deepEqual(
			Object.values(manifest).filter((value) => path.isAbsolute(value) || value.includes(appConfig.rootDir)),
			[],
		);
	});

	it('resolves the server entry and accepts the emitted config after the bundle moves to another directory', () => {
		const built = createBuiltApp('eco-deploy-manifest-moved-');
		const deployDir = mkdtempSync(path.join(tmpdir(), 'eco-deploy-manifest-target-'));
		tempDirs.push(deployDir);
		cpSync(path.join(built.rootDir, 'dist'), path.join(deployDir, 'dist'), { recursive: true });
		rmSync(built.rootDir, { recursive: true, force: true });

		const movedServerDir = path.join(deployDir, 'dist', SERVER_BUNDLE_DIR);
		assert.equal(resolveProductionServerEntry(deployDir), path.join(movedServerDir, SERVER_BUNDLE_FILENAME));
		assert.doesNotThrow(() =>
			assertProductionConfigIdentity(deployDir, path.join(movedServerDir, EMITTED_ECO_CONFIG_FILENAME)),
		);
	});

	it('looks for the server bundle in the given distDir', () => {
		const { rootDir, serverOutdir, emittedConfigPath } = createBuiltApp('eco-deploy-manifest-dist-dir-', 'build');

		assert.equal(resolveProductionServerEntry(rootDir, 'build'), path.join(serverOutdir, SERVER_BUNDLE_FILENAME));
		assert.equal(resolveProductionServerEntry(rootDir), undefined);
		assert.doesNotThrow(() => assertProductionConfigIdentity(rootDir, emittedConfigPath, { distDir: 'build' }));
	});

	it('resolves nothing when no server bundle was built', () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-deploy-manifest-none-'));
		tempDirs.push(rootDir);

		assert.equal(resolveProductionServerEntry(rootDir), undefined);
	});
});
