import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { RolldownBuildAdapter } from '../rolldown/rolldown-build-adapter.ts';
import {
	getServerBundleOutputPaths,
	lookupServerEntryBuildCache,
	recordServerEntryBuildCache,
	resolveProductionServerEntry,
	writeServerBundleDeployManifest,
} from './server-entry-build-cache.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../../utils/resolve-entry-file.ts';

describe('server-entry-build-cache', () => {
	const tempDirs: string[] = [];
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
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

	it('records and reuses server-entry cache metadata in production', () => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-server-entry-cache-prod-'));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, 'dist');
		const workDir = path.join(rootDir, '.eco');
		const entryPath = path.join(rootDir, 'app.ts');
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');

		const appConfig = {
			rootDir,
			distDir: 'dist',
			absolutePaths: {
				distDir,
				workDir,
				config: path.join(rootDir, 'eco.config.ts'),
			},
			processors: new Map(),
			integrations: [],
		} as unknown as EcoPagesAppConfig;

		const serverEntryPath = path.join(distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
		fileSystem.ensureDir(path.dirname(serverEntryPath));
		writeFileSync(serverEntryPath, 'export {};\n', 'utf8');

		recordServerEntryBuildCache({
			appConfig,
			entryPath,
			buildResult: {
				success: true,
				logs: [],
				outputs: [{ path: serverEntryPath }],
				dependencyGraph: {
					entrypoints: {
						[entryPath]: [entryPath],
					},
				},
			},
			outputPaths: [serverEntryPath],
		});

		const cached = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.ok(cached);
		assert.equal(cached?.outputPaths.includes(serverEntryPath), true);

		appConfig.loaders = new Map([
			[
				'jsx-owner',
				{
					name: 'jsx-owner',
					setup() {},
				},
			],
		]);

		assert.equal(lookupServerEntryBuildCache({ appConfig, entryPath }), undefined);
	});

	it('invalidates server-entry cache when a module the entry loads through import() changes', async () => {
		process.env.NODE_ENV = 'production';
		const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-server-entry-dynamic-import-')));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, 'dist');
		const entryPath = path.join(rootDir, 'app.ts');
		const lazyPath = path.join(rootDir, 'lazy.ts');
		writeFileSync(entryPath, "export const load = () => import('./lazy.ts');\n", 'utf8');
		writeFileSync(lazyPath, "export const message = 'first';\n", 'utf8');

		const appConfig = {
			rootDir,
			distDir: 'dist',
			absolutePaths: {
				distDir,
				workDir: path.join(rootDir, '.eco'),
				config: path.join(rootDir, 'eco.config.ts'),
			},
			processors: new Map(),
			integrations: [],
		} as unknown as EcoPagesAppConfig;

		const outdir = path.join(distDir, SERVER_BUNDLE_DIR);
		const buildResult = await new RolldownBuildAdapter().build({
			entrypoints: [entryPath],
			outdir,
			target: 'node',
			format: 'esm',
			splitting: true,
			root: rootDir,
		});
		assert.equal(buildResult.success, true);

		recordServerEntryBuildCache({
			appConfig,
			entryPath,
			buildResult,
			outputPaths: buildResult.outputs.map((output) => output.path),
		});
		assert.ok(lookupServerEntryBuildCache({ appConfig, entryPath }));

		writeFileSync(lazyPath, "export const message = 'second';\n", 'utf8');

		assert.equal(lookupServerEntryBuildCache({ appConfig, entryPath }), undefined);
	});

	it.each(['eco.config.ts', 'options.ts'])('invalidates server-entry cache when %s changes', (editedFile) => {
		process.env.NODE_ENV = 'production';
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-server-entry-config-change-'));
		tempDirs.push(rootDir);
		const distDir = path.join(rootDir, 'dist');
		const workDir = path.join(rootDir, '.eco');
		const entryPath = path.join(rootDir, 'app.ts');
		const configPath = path.join(rootDir, 'eco.config.ts');
		const optionsPath = path.join(rootDir, 'options.ts');
		writeFileSync(entryPath, 'export const ready = true;\n', 'utf8');
		writeFileSync(
			configPath,
			"import { options } from './options';\nexport default { rootDir: '.', options };\n",
			'utf8',
		);
		writeFileSync(optionsPath, 'export const options = { a: 1 };\n', 'utf8');

		const appConfig = {
			rootDir,
			distDir: 'dist',
			absolutePaths: {
				distDir,
				workDir,
				config: configPath,
				configModuleFiles: [configPath, optionsPath],
			},
			processors: new Map(),
			integrations: [],
		} as unknown as EcoPagesAppConfig;

		const serverEntryPath = path.join(distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
		fileSystem.ensureDir(path.dirname(serverEntryPath));
		writeFileSync(serverEntryPath, 'export {};\n', 'utf8');

		recordServerEntryBuildCache({
			appConfig,
			entryPath,
			buildResult: {
				success: true,
				logs: [],
				outputs: [{ path: serverEntryPath }],
				dependencyGraph: {
					entrypoints: {
						[entryPath]: [entryPath],
					},
				},
			},
			outputPaths: [serverEntryPath],
		});

		const initial = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.ok(initial);

		const editedPath = path.join(rootDir, editedFile);
		writeFileSync(editedPath, `${fileSystem.readFileSync(editedPath)}\nexport const modified = true;\n`, 'utf8');

		const afterConfigChange = lookupServerEntryBuildCache({ appConfig, entryPath });
		assert.equal(afterConfigChange, undefined);
	});
});
