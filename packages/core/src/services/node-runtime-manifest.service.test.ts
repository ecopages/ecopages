import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { createAppBuildManifest } from '../build/build-manifest.ts';
import { InMemoryDevGraphService, NoopDevGraphService } from './dev-graph.service.ts';
import {
	createNodeRuntimeManifest,
	getNodeRuntimeManifestPath,
	getAppNodeRuntimeManifest,
	setAppNodeRuntimeManifest,
	writeAppNodeRuntimeManifest,
} from './node-runtime-manifest.service.ts';
import { InMemoryRuntimeSpecifierRegistry } from './runtime-specifier-registry.service.ts';

test('createNodeRuntimeManifest summarizes app-owned runtime bootstrap state', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const runtimePlugin = { name: 'runtime-plugin', setup() {} };
	const browserPlugin = { name: 'browser-plugin', setup() {} };
	const appConfig = {
		rootDir: '/repo',
		absolutePaths: {
			config: '/repo/eco.config.ts',
			srcDir: '/repo/src',
			distDir: '/repo/.eco',
		},
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		runtime: {
			buildManifest: createAppBuildManifest({
				loaderPlugins: [loaderPlugin],
				runtimePlugins: [runtimePlugin],
				browserBundlePlugins: [browserPlugin],
			}),
			devGraphService: new InMemoryDevGraphService(),
			runtimeSpecifierRegistry: new InMemoryRuntimeSpecifierRegistry(),
		},
	} as any;

	const manifest = createNodeRuntimeManifest(appConfig, {
		entryModulePath: '/repo/app.ts',
	});

	assert.deepEqual(manifest, {
		runtime: 'node',
		appRootDir: '/repo',
		sourceRootDir: '/repo/src',
		distDir: '/repo/.eco',
		modulePaths: {
			config: '/repo/eco.config.ts',
			entry: '/repo/app.ts',
		},
		buildPlugins: {
			loaderPluginNames: ['loader-plugin'],
			runtimePluginNames: ['runtime-plugin'],
			browserBundlePluginNames: ['browser-plugin'],
		},
		serverTranspile: {
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			externalPackages: true,
		},
		browserBundles: {
			outputDir: path.join('/repo/.eco', 'assets'),
			publicBaseUrl: '/assets',
			vendorBaseUrl: '/assets/vendors',
		},
		bootstrap: {
			devGraphStrategy: 'selective',
			runtimeSpecifierRegistry: 'in-memory',
		},
	});
});

test('getAppNodeRuntimeManifest falls back to a derived manifest and can be overridden', () => {
	const loaderPlugin = { name: 'loader-plugin', setup() {} };
	const appConfig = {
		rootDir: '/repo',
		absolutePaths: {
			config: '/repo/eco.config.ts',
			srcDir: '/repo/src',
			distDir: '/repo/.eco',
		},
		loaders: new Map([[loaderPlugin.name, loaderPlugin]]),
		runtime: {
			devGraphService: new NoopDevGraphService(),
			runtimeSpecifierRegistry: new InMemoryRuntimeSpecifierRegistry(),
		},
	} as any;

	const derivedManifest = getAppNodeRuntimeManifest(appConfig);
	assert.equal(derivedManifest.modulePaths.config, '/repo/eco.config.ts');
	assert.equal(derivedManifest.modulePaths.entry, undefined);
	assert.equal(derivedManifest.bootstrap.devGraphStrategy, 'noop');

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
			distDir: path.join(rootDir, '.eco'),
		},
		loaders: new Map(),
		runtime: {
			devGraphService: new NoopDevGraphService(),
			runtimeSpecifierRegistry: new InMemoryRuntimeSpecifierRegistry(),
		},
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
