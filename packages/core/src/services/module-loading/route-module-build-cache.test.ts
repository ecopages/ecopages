import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
	ROUTE_MODULE_BUILD_CACHE_FILENAME,
	RouteModuleBuildCache,
	type RouteModuleBuildCacheManifest,
	createPersistedRouteModuleBuildKey,
	createPluginCacheKey,
	hashPluginSetup,
	resolvePageModuleOutputFileName,
	shouldPersistRouteModuleBuildCache,
} from './route-module-build-cache.ts';
import {
	clearProductionBuildCaches,
	shouldResetStaticExportDirectory,
} from '../../static-site-generator/static-build-invalidation.ts';
import { RouteModuleDependencyHasher } from './route-module-dependency-hasher.ts';

function createTestDependencyHasher(): RouteModuleDependencyHasher {
	return new RouteModuleDependencyHasher({
		exists: () => true,
		hashFile: (filePath) => `hash:${basename(filePath)}`,
	});
}

describe('RouteModuleBuildCache', () => {
	let tempDir: string;
	let manifestWrites: RouteModuleBuildCacheManifest[];

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'ecopages-route-module-build-cache-'));
		manifestWrites = [];
		delete process.env.NODE_ENV;
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		delete process.env.NODE_ENV;
	});

	function createCache(): RouteModuleBuildCache {
		return new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			readManifest: () => undefined,
			writeManifest: (_manifestPath, manifest) => {
				manifestWrites.push(structuredClone(manifest));
			},
			exists: (filePath) => filePath.endsWith('.mjs'),
			createDependencyHasher: () => createTestDependencyHasher(),
		});
	}

	it('resolves stable production output filenames from source hashes', () => {
		assert.equal(
			resolvePageModuleOutputFileName({
				filePath: '/app/pages/about.tsx',
				fileHash: 'abc123',
			}),
			'about-abc123.mjs',
		);
	});

	it('does not persist cache entries outside production builds', () => {
		assert.equal(
			shouldPersistRouteModuleBuildCache({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			false,
		);

		process.env.NODE_ENV = 'development';
		assert.equal(
			shouldPersistRouteModuleBuildCache({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			false,
		);
	});

	it('does not persist scoped imports used only for probes or request metadata', () => {
		process.env.NODE_ENV = 'production';
		assert.equal(
			shouldPersistRouteModuleBuildCache({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
				cacheScope: 'static-page-probe',
			}),
			false,
		);
	});

	it('treats rootDir paths with and without trailing slashes as the same build key', () => {
		const withSlash = createPersistedRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app/',
			outdir: tempDir,
		});
		const withoutSlash = createPersistedRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
		});

		assert.equal(withSlash, withoutSlash);
	});

	it('returns a cache hit when rootDir trailing slashes differ between record and lookup', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'about-abc123.mjs');
		const cache = createCache();
		const filePath = '/app/pages/about.tsx';

		cache.recordBuild({
			filePath,
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
			outputPath,
			dependencyModulePaths: [filePath],
		});

		const lookup = cache.lookup({
			filePath,
			rootDir: '/app/',
			outdir: tempDir,
			fileHash: 'abc123',
		});

		assert.equal(lookup?.outputPath, outputPath);
	});

	it('returns a cache hit when the manifest, import graph, and output file all match', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'about-abc123.mjs');
		const cache = createCache();
		const options = {
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
		};

		cache.recordBuild({
			...options,
			outputPath,
			dependencyModulePaths: ['/app/pages/about.tsx', '/app/layouts/shared.tsx'],
		});

		const lookup = cache.lookup(options);
		assert.deepEqual(lookup?.entry.dependencyHashes, {
			'/app/layouts/shared.tsx': 'hash:shared.tsx',
			'/app/pages/about.tsx': 'abc123',
		});
		assert.equal(lookup?.outputPath, outputPath);
	});

	it('misses when a tracked dependency hash changes', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'about-abc123.mjs');
		const hashes = new Map<string, string>([
			['/app/pages/about.tsx', 'hash:about.tsx'],
			['/app/layouts/shared.tsx', 'hash:shared.tsx'],
		]);
		const hasher = new RouteModuleDependencyHasher({
			exists: () => true,
			hashFile: (filePath) => hashes.get(filePath) ?? 'missing',
		});
		const cache = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			readManifest: () => undefined,
			writeManifest: () => {},
			exists: () => true,
			createDependencyHasher: () => hasher,
		});
		const options = {
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
		};

		cache.recordBuild({
			...options,
			outputPath,
			dependencyModulePaths: ['/app/pages/about.tsx', '/app/layouts/shared.tsx'],
		});

		hashes.set('/app/layouts/shared.tsx', 'hash:shared.tsx-v2');
		hasher.clearMemo();

		assert.equal(cache.lookup(options), undefined);
	});

	it('misses when the core package invalidation version changes', () => {
		const outputPath = join(tempDir, 'about-abc123.mjs');
		const cache = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '2.0.0-test',
			readManifest: () => ({
				invalidationVersion: '1.0.0-test',
				entries: {
					'/app/pages/about.tsx': {
						sourceHash: 'abc123',
						outputPath,
						builtAt: 1,
						buildKey: 'stale',
						dependencyHashes: {
							'/app/pages/about.tsx': 'hash:about.tsx',
						},
					},
				},
			}),
			writeManifest: () => {},
			exists: () => true,
			createDependencyHasher: () => createTestDependencyHasher(),
		});

		assert.equal(
			cache.lookup({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
				fileHash: 'abc123',
			}),
			undefined,
		);
	});

	it('misses when the build key changes even if the source hash is unchanged', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'about-abc123.mjs');
		const cache = createCache();
		const baseOptions = {
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
		};

		cache.recordBuild({
			...baseOptions,
			outputPath,
			dependencyModulePaths: ['/app/pages/about.tsx'],
		});

		assert.equal(
			cache.lookup({
				...baseOptions,
				jsx: {
					importSource: 'react',
					runtime: 'automatic',
				},
			}),
			undefined,
		);
	});

	it('changes the build key when plugin setup changes even if names stay the same', () => {
		const pluginA = {
			name: 'test-plugin',
			setup() {},
		};
		const pluginB = {
			name: 'test-plugin',
			setup() {
				void 'different';
			},
		};

		const keyA = createPersistedRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			plugins: [pluginA],
		});
		const keyB = createPersistedRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			plugins: [pluginB],
		});

		assert.notEqual(keyA, keyB);
		assert.notEqual(createPluginCacheKey([pluginA]), createPluginCacheKey([pluginB]));
		assert.notEqual(hashPluginSetup(pluginA.setup), hashPluginSetup(pluginB.setup));
	});

	it('prunes rendered outputs that are no longer part of the active route set', () => {
		process.env.NODE_ENV = 'production';
		const cache = createCache();
		const context = {
			configHash: 'config-1',
			buildInputsFingerprint: 'stable',
		};
		const filePath = '/app/pages/about.tsx';

		cache.recordBuild({
			filePath,
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
			outputPath: join(tempDir, 'about-abc123.mjs'),
			dependencyModulePaths: [filePath],
		});
		cache.ensureIncrementalStaticGenerationContext(context);
		cache.recordStaticRender({
			filePath,
			pathname: '/about',
			sourceHash: 'abc123',
			renderedOutputPath: join(tempDir, 'dist', 'about.html'),
			context,
		});
		cache.recordStaticRender({
			filePath,
			pathname: '/legacy',
			sourceHash: 'abc123',
			renderedOutputPath: join(tempDir, 'dist', 'legacy.html'),
			context,
		});

		const removed = cache.pruneStaleRenderedOutputs(new Set(['/about']));

		assert.deepEqual(removed, [join(tempDir, 'dist', 'legacy.html')]);
		assert.equal(
			cache.lookupStaticRender({
				filePath,
				pathname: '/legacy',
				sourceHash: 'abc123',
				renderedOutputPath: join(tempDir, 'dist', 'legacy.html'),
				context,
			}),
			false,
		);
	});

	it('records and reuses static render outputs by pathname when the import graph is fresh', () => {
		process.env.NODE_ENV = 'production';
		const cache = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			readManifest: () => undefined,
			writeManifest: (_manifestPath, manifest) => {
				manifestWrites.push(structuredClone(manifest));
			},
			exists: () => true,
			createDependencyHasher: () => createTestDependencyHasher(),
		});
		const context = {
			configHash: 'config-1',
			buildInputsFingerprint: 'stable',
		};
		const filePath = '/app/pages/about.tsx';
		const pathname = '/about';
		const renderedOutputPath = join(tempDir, 'dist', 'about.html');

		cache.recordBuild({
			filePath,
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
			outputPath: join(tempDir, 'about-abc123.mjs'),
			dependencyModulePaths: [filePath, '/app/layouts/shared.tsx'],
		});
		cache.ensureIncrementalStaticGenerationContext(context);
		cache.recordStaticRender({
			filePath,
			pathname,
			sourceHash: 'abc123',
			renderedOutputPath,
			context,
		});

		assert.equal(
			cache.lookupStaticRender({
				filePath,
				pathname,
				sourceHash: 'abc123',
				renderedOutputPath,
				context,
			}),
			true,
		);
	});

	it('writes the manifest to the route-module outdir', async () => {
		process.env.NODE_ENV = 'production';
		const manifestPath = join(tempDir, ROUTE_MODULE_BUILD_CACHE_FILENAME);
		const cache = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			createDependencyHasher: () => createTestDependencyHasher(),
		});
		const outputPath = join(tempDir, 'about-abc123.mjs');
		writeFileSync(outputPath, 'export default {};', 'utf8');

		cache.recordBuild({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
			outputPath,
			dependencyModulePaths: ['/app/pages/about.tsx'],
		});

		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RouteModuleBuildCacheManifest;
		assert.equal(manifest.invalidationVersion, '1.0.0-test');
		assert.deepEqual(manifest.entries['/app/pages/about.tsx'], {
			sourceHash: 'abc123',
			outputPath,
			builtAt: manifest.entries['/app/pages/about.tsx']?.builtAt,
			buildKey: createPersistedRouteModuleBuildKey({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			dependencyHashes: {
				'/app/pages/about.tsx': 'abc123',
			},
		});
	});
});

describe('production build cache utilities', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'ecopages-build-cache-utils-'));
		delete process.env.NODE_ENV;
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		delete process.env.NODE_ENV;
	});

	it('clears persisted manifests on force builds in production', () => {
		process.env.NODE_ENV = 'production';
		const ecoDir = join(tempDir, '.eco');
		const modulesDir = join(ecoDir, '.server-modules');
		const manifestPath = join(modulesDir, ROUTE_MODULE_BUILD_CACHE_FILENAME);
		mkdirSync(modulesDir, { recursive: true });
		writeFileSync(manifestPath, '{}', 'utf8');
		const cache = new RouteModuleBuildCache(modulesDir, {
			getCorePackageVersion: () => '1.0.0-test',
			readManifest: () => ({
				invalidationVersion: '1.0.0-test',
				entries: {
					'/app/pages/about.tsx': {
						sourceHash: 'abc123',
						outputPath: join(modulesDir, 'about.mjs'),
						builtAt: 1,
						buildKey: 'stale',
					},
				},
			}),
			writeManifest: () => {},
			exists: () => true,
		});

		clearProductionBuildCaches({
			rootDir: tempDir,
			workDir: '.eco',
			absolutePaths: {
				workDir: ecoDir,
			},
			runtime: {
				routeModuleBuildCaches: new Map([[modulesDir, cache]]),
			},
		} as any);

		assert.equal(existsSync(manifestPath), false);
		assert.equal(
			cache.lookup({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: modulesDir,
				fileHash: 'abc123',
			}),
			undefined,
		);
	});

	it('clears persisted pages unified graph manifest on force builds in production', () => {
		process.env.NODE_ENV = 'production';
		const ecoDir = join(tempDir, '.eco');
		const graphManifestPath = join(ecoDir, '.server-pages-graph', ROUTE_MODULE_BUILD_CACHE_FILENAME);
		mkdirSync(join(ecoDir, '.server-pages-graph'), { recursive: true });
		writeFileSync(graphManifestPath, '{}', 'utf8');

		clearProductionBuildCaches({
			rootDir: tempDir,
			workDir: '.eco',
			absolutePaths: {
				workDir: ecoDir,
			},
		} as any);

		assert.equal(existsSync(graphManifestPath), false);
	});

	it('requests a dist reset when incremental static generation is unavailable', () => {
		process.env.NODE_ENV = 'production';
		const ecoDir = join(tempDir, '.eco');
		mkdirSync(join(ecoDir, '.server-modules'), { recursive: true });

		assert.equal(
			shouldResetStaticExportDirectory(
				{
					rootDir: tempDir,
					workDir: '.eco',
					absolutePaths: { workDir: ecoDir, distDir: join(tempDir, 'dist') },
					processors: new Map(),
					integrations: [],
				} as any,
				false,
			),
			true,
		);
	});
});
