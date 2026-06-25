import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import {
	getServerBundleOutputPaths,
	lookupServerEntryBuildCache,
	recordServerEntryBuildCache,
	resolveProductionServerEntry,
	writeServerBundleDeployManifest,
} from './server-entry-build-cache.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../utils/resolve-entry-file.ts';

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
		} as never;

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
		} as never;

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
	});
});
