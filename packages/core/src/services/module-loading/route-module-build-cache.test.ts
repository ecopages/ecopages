import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
	createRouteModuleBuildKey,
	resolvePageModuleOutputFileName,
	shouldCacheRouteModuleBuild,
} from './route-module-build-manifest.ts';
import { RouteModuleBuildCache } from './route-module-build-cache.store.ts';
import { getSharedRouteModuleBuildCache } from './route-module-build-cache-registry.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createPluginCacheKey, hashFunctionIdentity } from '../../build/cache/cache-keys.ts';
import { RouteModuleDependencyHasher } from './route-module-dependency-hasher.ts';

function createTestDependencyHasher(): RouteModuleDependencyHasher {
	return new RouteModuleDependencyHasher({
		exists: () => true,
		hashFile: (filePath) => `hash:${basename(filePath)}`,
	});
}

describe('RouteModuleBuildCache', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'ecopages-route-module-build-cache-'));
		delete process.env.NODE_ENV;
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		delete process.env.NODE_ENV;
	});

	function createCache(exists: (filePath: string) => boolean = (filePath) => filePath.endsWith('.mjs')) {
		return new RouteModuleBuildCache({
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
			shouldCacheRouteModuleBuild({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			false,
		);

		process.env.NODE_ENV = 'development';
		assert.equal(
			shouldCacheRouteModuleBuild({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			true,
		);

		process.env.NODE_ENV = 'production';
		assert.equal(
			shouldCacheRouteModuleBuild({
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
			shouldCacheRouteModuleBuild({
				filePath: '/app/pages/about.tsx',
				rootDir: '/app',
				outdir: tempDir,
			}),
			true,
		);
	});

	it('treats rootDir paths with and without trailing slashes as the same build key', () => {
		const withSlash = createRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app/',
			outdir: tempDir,
		});
		const withoutSlash = createRouteModuleBuildKey({
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
			cache.lookup(options)?.entry.outputImports.sort(),
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

		assert.deepEqual(cache.lookup(options)?.entry.outputImports.sort(), [srcChunk, commonChunk].sort());
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
		const cache = new RouteModuleBuildCache({
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
		const cache = new RouteModuleBuildCache({
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

		const keyA = createRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			plugins: [pluginA],
		});
		const keyB = createRouteModuleBuildKey({
			filePath: '/app/pages/about.tsx',
			rootDir: '/app',
			outdir: tempDir,
			plugins: [pluginB],
		});

		assert.notEqual(keyA, keyB);
		assert.notEqual(createPluginCacheKey([pluginA]), createPluginCacheKey([pluginB]));
		assert.notEqual(hashFunctionIdentity(pluginA.setup), hashFunctionIdentity(pluginB.setup));
	});

	it('keeps entries in memory, so another cache instance starts empty', () => {
		process.env.NODE_ENV = 'production';
		const cache = new RouteModuleBuildCache({
			createDependencyHasher: () => createTestDependencyHasher(),
		});
		const options = { filePath: '/app/pages/about.tsx', rootDir: '/app', outdir: tempDir, fileHash: 'abc123' };
		const outputPath = join(tempDir, 'about-abc123.mjs');
		writeFileSync(outputPath, 'export default {};', 'utf8');

		cache.recordBuild({ ...options, outputPath, dependencyModulePaths: ['/app/pages/about.tsx'] });

		assert.equal(cache.lookup(options)?.outputPath, outputPath);
		assert.equal(
			new RouteModuleBuildCache({ createDependencyHasher: () => createTestDependencyHasher() }).lookup(options),
			undefined,
		);
	});

	it('forgets every entry after development invalidation', () => {
		process.env.NODE_ENV = 'development';
		const cache = createCache();
		const options = { filePath: '/app/pages/about.tsx', rootDir: '/app', outdir: tempDir, fileHash: 'abc123' };
		cache.recordBuild({
			...options,
			outputPath: join(tempDir, 'about-abc123.mjs'),
			dependencyModulePaths: ['/app/pages/about.tsx'],
		});
		assert.ok(cache.lookup(options));

		cache.clearDevelopmentEntries();

		assert.equal(cache.lookup(options), undefined);
	});
});
