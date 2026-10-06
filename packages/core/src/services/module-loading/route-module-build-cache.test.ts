import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
	ROUTE_MODULE_BUILD_CACHE_FILENAME,
	type RouteModuleBuildCacheManifest,
	createPersistedRouteModuleBuildKey,
	readRouteModuleBuildCacheManifest,
	resolvePageModuleOutputFileName,
	shouldPersistRouteModuleBuildCache,
} from './route-module-build-manifest.ts';
import { RouteModuleBuildCache } from './route-module-build-cache.store.ts';
import { getSharedRouteModuleBuildCache } from './route-module-build-cache-registry.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createPluginCacheKey, hashFunctionIdentity } from '../../build/cache/cache-keys.ts';
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

	function createCache(exists: (filePath: string) => boolean = (filePath) => filePath.endsWith('.mjs')) {
		return new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			readManifest: () => undefined,
			writeManifest: (_manifestPath, manifest) => {
				manifestWrites.push(structuredClone(manifest));
			},
			exists,
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

	it('persists unchanged development and production route-module builds', () => {
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
			true,
		);

		process.env.NODE_ENV = 'production';
		assert.equal(
			shouldPersistRouteModuleBuildCache({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			true,
		);
	});

	it('persists scoped imports used only for probes or request metadata', () => {
		process.env.NODE_ENV = 'production';
		assert.equal(
			shouldPersistRouteModuleBuildCache({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			true,
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

	it('misses once a file the cached output imports is gone', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'posts-abc123.mjs');
		const collectionPath = join(tempDir, '..', '.server-collections', 'posts-1.mjs');
		const present = new Set([outputPath, collectionPath, join(tempDir, 'chunk-a.js'), join(tempDir, 'lazy-b.js')]);
		const cache = createCache((filePath) => present.has(filePath));
		const options = { filePath: '/app/pages/posts.tsx', rootDir: '/app', outdir: tempDir, fileHash: 'abc123' };

		cache.recordBuild({
			...options,
			outputPath,
			dependencyModulePaths: ['/app/pages/posts.tsx'],
			outputImports: [collectionPath, join(tempDir, 'chunk-a.js'), join(tempDir, 'lazy-b.js')],
		});

		assert.deepEqual(
			manifestWrites[manifestWrites.length - 1]?.entries['/app/pages/posts.tsx']?.outputImports?.sort(),
			[join(tempDir, 'chunk-a.js'), join(tempDir, 'lazy-b.js'), collectionPath].sort(),
		);
		assert.equal(cache.lookup(options)?.outputPath, outputPath);

		present.delete(collectionPath);
		assert.equal(cache.lookup(options), undefined);
	});

	it('misses once a shared chunk reached through another output import is gone', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'page-abc123.mjs');
		const srcChunk = join(tempDir, 'src-CLtpMCiA.js');
		const commonChunk = join(tempDir, 'common-C70_Ss5a.js');
		const present = new Set([outputPath, srcChunk, commonChunk]);
		const cache = createCache((filePath) => present.has(filePath));
		const options = { filePath: '/app/pages/index.tsx', rootDir: '/app', outdir: tempDir, fileHash: 'abc123' };

		cache.recordBuild({
			...options,
			outputPath,
			dependencyModulePaths: ['/app/pages/index.tsx'],
			outputImports: [srcChunk, commonChunk],
		});

		assert.deepEqual(
			manifestWrites[manifestWrites.length - 1]?.entries['/app/pages/index.tsx']?.outputImports?.sort(),
			[srcChunk, commonChunk].sort(),
		);
		assert.equal(cache.lookup(options)?.outputPath, outputPath);

		present.delete(commonChunk);
		assert.equal(cache.lookup(options), undefined);
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

	it('misses after the config module or a file it imports changes', () => {
		process.env.NODE_ENV = 'production';
		let configHash = 'config-a';
		const cache = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			readManifest: () => undefined,
			writeManifest: () => {},
			exists: (filePath) => filePath.endsWith('.mjs'),
			createDependencyHasher: () => createTestDependencyHasher(),
			getConfigHash: () => configHash,
		});
		const options = { filePath: '/app/pages/post.mdx', rootDir: '/app', outdir: tempDir, fileHash: 'abc123' };
		cache.recordBuild({
			...options,
			outputPath: join(tempDir, 'post-abc123.mjs'),
			dependencyModulePaths: ['/app/pages/post.mdx'],
		});
		assert.ok(cache.lookup(options));

		configHash = 'config-b';

		assert.equal(cache.lookup(options), undefined);
	});

	it('keys the shared app cache on the config module and the files it imports', () => {
		process.env.NODE_ENV = 'production';
		const configPath = join(tempDir, 'eco.config.ts');
		const optionsPath = join(tempDir, 'options.ts');
		writeFileSync(configPath, "import { options } from './options';\nexport default { options };\n");
		writeFileSync(optionsPath, 'export const options = { a: 1 };\n');
		const pagePath = join(tempDir, 'post.mdx');
		writeFileSync(pagePath, '# Post\n');
		const outputPath = join(tempDir, 'post-abc123.mjs');
		writeFileSync(outputPath, 'export default {};\n');
		const appConfig = {
			absolutePaths: { config: configPath, configModuleFiles: [configPath, optionsPath] },
		} as unknown as EcoPagesAppConfig;
		const cache = getSharedRouteModuleBuildCache(tempDir, appConfig);
		const options = { filePath: pagePath, rootDir: tempDir, outdir: tempDir, fileHash: 'abc123' };
		cache.recordBuild({ ...options, outputPath, dependencyModulePaths: [pagePath] });
		assert.ok(cache.lookup(options));

		writeFileSync(optionsPath, 'export const options = { a: 2 };\n');
		assert.ok(cache.lookup(options), 'a running process keeps the options it loaded');

		const nextProcessConfig = { absolutePaths: appConfig.absolutePaths } as unknown as EcoPagesAppConfig;
		assert.equal(getSharedRouteModuleBuildCache(tempDir, nextProcessConfig).lookup(options), undefined);
	});

	it('misses when the core package version changes', () => {
		const outputPath = join(tempDir, 'about-abc123.mjs');
		const cache = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '2.0.0-test',
			readManifest: () => ({
				corePackageVersion: '1.0.0-test',
				entries: {
					'/app/pages/about.tsx': {
						sourceHash: 'abc123',
						outputPath,
						builtAt: 1,
						buildKey: 'stale',
						dependencyHashes: {
							'/app/pages/about.tsx': 'hash:about.tsx',
						},
						outputImports: [],
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
		assert.notEqual(hashFunctionIdentity(pluginA.setup), hashFunctionIdentity(pluginB.setup));
	});

	it('prunes rendered outputs that are no longer part of the active route set', () => {
		process.env.NODE_ENV = 'production';
		const cache = createCache();
		const context = {
			configHash: 'config-1',
			buildInputsFingerprint: 'stable',
			watchedInputsHash: 'none',
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

	it('stops incremental static generation when watched rendering inputs change', () => {
		process.env.NODE_ENV = 'production';
		const cache = createCache();
		const context = { configHash: 'config-1', buildInputsFingerprint: 'stable', watchedInputsHash: 'content-1' };

		cache.ensureIncrementalStaticGenerationContext(context);

		assert.equal(cache.isIncrementalStaticGenerationAvailable(context), true);
		assert.equal(
			cache.isIncrementalStaticGenerationAvailable({ ...context, watchedInputsHash: 'content-2' }),
			false,
		);
	});

	it('records the watched-inputs hash of the last static render, so the next export can compare it', () => {
		process.env.NODE_ENV = 'production';
		const cache = createCache();
		const context = { configHash: 'config-1', buildInputsFingerprint: 'stable', watchedInputsHash: 'content-7' };

		cache.recordStaticRender({
			filePath: '/app/pages/about.tsx',
			pathname: '/about',
			sourceHash: 'abc123',
			renderedOutputPath: join(tempDir, 'dist', 'about.html'),
			context,
		});

		assert.equal(cache.getRecordedWatchedInputsHash(), 'content-7');
		assert.equal(manifestWrites[manifestWrites.length - 1]?.watchedInputsHash, 'content-7');
	});

	it('drops rendered outputs when the route module is rebuilt', () => {
		process.env.NODE_ENV = 'production';
		const cache = createCache((filePath) => filePath.endsWith('.mjs') || filePath.endsWith('.html'));
		const context = {
			configHash: 'config-1',
			buildInputsFingerprint: 'stable',
			watchedInputsHash: 'none',
		};
		const filePath = '/app/pages/about.tsx';
		const pathname = '/about';
		const renderedOutputPath = join(tempDir, 'dist', 'about.html');
		const outputPath = join(tempDir, 'about-abc123.mjs');

		cache.recordBuild({
			filePath,
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
			outputPath,
			dependencyModulePaths: [filePath],
		});
		cache.ensureIncrementalStaticGenerationContext(context);
		cache.recordStaticRender({
			filePath,
			pathname,
			sourceHash: 'abc123',
			renderedOutputPath,
			context,
		});

		const otherFilePath = '/app/pages/contact.tsx';
		cache.recordBuild({
			filePath: otherFilePath,
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'xyz789',
			outputPath: join(tempDir, 'contact-xyz789.mjs'),
			dependencyModulePaths: [otherFilePath],
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
			'unrelated route build preserves about static render output',
		);

		cache.recordBuild({
			filePath,
			rootDir: '/app',
			outdir: tempDir,
			fileHash: 'abc123',
			outputPath,
			dependencyModulePaths: [filePath],
		});

		assert.equal(
			cache.lookupStaticRender({
				filePath,
				pathname,
				sourceHash: 'abc123',
				renderedOutputPath,
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
			watchedInputsHash: 'none',
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
			outputImports: [join(tempDir, 'chunk-a.js')],
		});
		cache.ensureIncrementalStaticGenerationContext(context);
		cache.recordStaticRender({
			filePath,
			pathname,
			sourceHash: 'abc123',
			renderedOutputPath,
			context,
		});

		assert.deepEqual(manifestWrites[manifestWrites.length - 1]?.entries[filePath]?.outputImports, [
			join(tempDir, 'chunk-a.js'),
		]);

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

	it('does not write a route-module manifest to disk', () => {
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

		assert.equal(existsSync(manifestPath), false);
		assert.equal(
			cache.lookup({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
				fileHash: 'abc123',
			})?.outputPath,
			outputPath,
		);

		const otherProcess = new RouteModuleBuildCache(tempDir, {
			getCorePackageVersion: () => '1.0.0-test',
			createDependencyHasher: () => createTestDependencyHasher(),
		});
		assert.equal(
			otherProcess.lookup({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
				fileHash: 'abc123',
			}),
			undefined,
		);
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

	it('drops persisted entries that have no outputImports when reading the manifest', () => {
		const manifestPath = join(tempDir, ROUTE_MODULE_BUILD_CACHE_FILENAME);
		const entry = { sourceHash: 'a', outputPath: '/out/a.mjs', builtAt: 1, buildKey: 'key' };
		writeFileSync(
			manifestPath,
			JSON.stringify({
				corePackageVersion: '1.0.0-test',
				entries: { '/app/legacy.tsx': entry, '/app/current.tsx': { ...entry, outputImports: [] } },
			}),
			'utf8',
		);

		assert.deepEqual(Object.keys(readRouteModuleBuildCacheManifest(manifestPath)?.entries ?? {}), [
			'/app/current.tsx',
		]);
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
				corePackageVersion: '1.0.0-test',
				entries: {
					'/app/pages/about.tsx': {
						sourceHash: 'abc123',
						outputPath: join(modulesDir, 'about.mjs'),
						builtAt: 1,
						buildKey: 'stale',
						outputImports: [],
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
