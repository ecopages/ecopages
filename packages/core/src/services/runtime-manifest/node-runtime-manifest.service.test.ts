import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
	createNodeRuntimeManifest,
	getNodeRuntimeManifestPath,
	getAppNodeRuntimeManifest,
	setAppNodeRuntimeManifest,
	writeAppNodeRuntimeManifest,
} from './node-runtime-manifest.service.ts';

test('createNodeRuntimeManifest summarizes app-owned runtime bootstrap state', () => {
	const appConfig = {
		rootDir: '/repo',
		absolutePaths: {
			config: '/repo/eco.config.ts',
			srcDir: '/repo/src',
			distDir: '/repo/dist',
			workDir: '/repo/.eco',
		},
		loaders: new Map(),
		runtime: {},
	} as any;

	const manifest = createNodeRuntimeManifest(appConfig, {
		entryModulePath: '/repo/app.ts',
	});

	assert.deepEqual(manifest, {
		runtime: 'node',
		appRootDir: '/repo',
		sourceRootDir: '/repo/src',
		distDir: '/repo/dist',
		workDir: '/repo/.eco',
		modulePaths: {
			config: '/repo/eco.config.ts',
			entry: '/repo/app.ts',
		},
	});
});

test('getAppNodeRuntimeManifest falls back to a derived manifest and can be overridden', () => {
	const appConfig = {
		rootDir: '/repo',
		absolutePaths: {
			config: '/repo/eco.config.ts',
			srcDir: '/repo/src',
			distDir: '/repo/dist',
			workDir: '/repo/.eco',
		},
		loaders: new Map(),
		runtime: {},
	} as any;

	const derivedManifest = getAppNodeRuntimeManifest(appConfig);
	assert.equal(derivedManifest.modulePaths.config, '/repo/eco.config.ts');
	assert.equal(derivedManifest.modulePaths.entry, undefined);

	const overriddenManifest = createNodeRuntimeManifest(appConfig, {
		entryModulePath: '/repo/custom-entry.ts',
	});
	setAppNodeRuntimeManifest(appConfig, overriddenManifest);

	assert.deepEqual(getAppNodeRuntimeManifest(appConfig), overriddenManifest);
});

test('writeAppNodeRuntimeManifest persists the app-owned manifest to the runtime file boundary', () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-runtime-manifest-'));
	const appConfig = {
		rootDir,
		absolutePaths: {
			config: path.join(rootDir, 'eco.config.ts'),
			srcDir: path.join(rootDir, 'src'),
			distDir: path.join(rootDir, 'dist'),
			workDir: path.join(rootDir, '.eco'),
		},
		loaders: new Map(),
		runtime: {},
	} as any;

	try {
		const result = writeAppNodeRuntimeManifest(appConfig, {
			entryModulePath: path.join(rootDir, 'app.ts'),
		});

		assert.equal(result.manifestFilePath, getNodeRuntimeManifestPath(appConfig));
		assert.equal(fs.existsSync(result.manifestFilePath), true);
		assert.deepEqual(JSON.parse(fs.readFileSync(result.manifestFilePath, 'utf8')), result.manifest);
		assert.equal(result.manifest.modulePaths.entry, path.join(rootDir, 'app.ts'));
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
