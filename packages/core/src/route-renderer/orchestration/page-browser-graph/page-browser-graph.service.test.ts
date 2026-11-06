import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { createAppRuntime, requireAppRuntime } from '../../../config/assembly/app-runtime.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../../assets/asset-processing-service/index.ts';
import {
	collectPageBrowserGraphDependencyPaths,
	createPageBrowserGraphEntryFingerprint,
	SessionPageBrowserGraphCache,
} from './page-browser-graph-session.ts';
import { PageBrowserGraphService } from './page-browser-graph.service.ts';
import { createPageDependencyInstanceKey } from './route-instance-key.ts';

let appConfig: EcoPagesAppConfig;

beforeEach(() => {
	appConfig = {
		rootDir: '/app',
		loaders: new Map(),
		processors: new Map(),
		integrations: [
			{
				name: 'react',
				extensions: ['.tsx'],
				plugins: () => [],
				browserRuntimeManifest: { runtimeGlobals: [], hmrRequirements: [] },
			},
		],
		absolutePaths: {
			pagesDir: '/app/pages',
		},
	} as unknown as EcoPagesAppConfig;
	createAppRuntime(appConfig);
});

function createGroupedDependency(): AssetDefinition {
	return {
		kind: 'script',
		source: 'content',
		content: 'console.log("hydrate")',
		name: 'page-entry',
		groupedBundle: { id: 'react-router-pages', entryName: 'index' },
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	requireAppRuntime(appConfig).productionBrowserGraphsSealed = false;
});

describe('SessionPageBrowserGraphCache', () => {
	test('reuses a valid graph record on cache hit', async () => {
		const session = new SessionPageBrowserGraphCache();
		let builds = 0;

		const key = {
			integrationName: 'react',
			routeFile: '/app/pages/index.tsx',
			dependencyInstanceKey: '',
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		const first = await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
			builds += 1;
			return {
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});
		const second = await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
			builds += 1;
			return {
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});

		expect(first).toEqual({ entryAssets: [], chunkAssets: [] });
		expect(second).toEqual(first);
		expect(builds).toBe(1);
	});

	test('coalesces concurrent builds for the same graph key', async () => {
		const session = new SessionPageBrowserGraphCache();
		let builds = 0;
		let releaseBuild: (() => void) | undefined;
		const buildGate = new Promise<void>((resolve) => {
			releaseBuild = resolve;
		});

		const key = {
			integrationName: 'react',
			routeFile: '/app/pages/index.tsx',
			dependencyInstanceKey: '',
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		const build = session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
			builds += 1;
			await buildGate;
			return {
				result: {
					entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/index.js' }],
					chunkAssets: [],
				},
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});
		const concurrent = session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
			builds += 1;
			return {
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});

		releaseBuild?.();
		const [first, second] = await Promise.all([build, concurrent]);

		expect(first).toEqual(second);
		expect(builds).toBe(1);
	});

	test('builds a non-cacheable graph independently of an in-flight cached build', async () => {
		const session = new SessionPageBrowserGraphCache();
		let releaseCachedBuild: (() => void) | undefined;
		const cachedBuildGate = new Promise<void>((resolve) => {
			releaseCachedBuild = resolve;
		});
		const key = {
			integrationName: 'react',
			routeFile: '/app/pages/index.tsx',
			dependencyInstanceKey: '',
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'production' as const,
		};

		const cachedBuild = session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
			await cachedBuildGate;
			return {
				result: {
					entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/cached.js' }],
					chunkAssets: [],
				},
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});
		const nonCacheableBuild = session.resolveGraph(
			key,
			new Set(['/app/pages/index.tsx']),
			async () => ({
				result: {
					entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/fresh.js' }],
					chunkAssets: [],
				},
				dependencyPaths: new Set(['/app/pages/index.tsx']),
				cacheable: false,
			}),
			{ reuseCachedResult: false },
		);

		releaseCachedBuild?.();
		const [cached, nonCacheable] = await Promise.all([cachedBuild, nonCacheableBuild]);

		expect(cached?.entryAssets[0]?.filepath).toBe('/assets/cached.js');
		expect(nonCacheable?.entryAssets[0]?.filepath).toBe('/assets/fresh.js');
	});

	test('preserves the last valid record when a rebuild fails', async () => {
		const session = new SessionPageBrowserGraphCache();
		const key = {
			integrationName: 'react',
			routeFile: '/app/pages/index.tsx',
			dependencyInstanceKey: '',
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => ({
			result: { entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/index.js' }], chunkAssets: [] },
			dependencyPaths: new Set(['/app/pages/index.tsx']),
		}));

		await expect(
			session.resolveGraph(
				{
					...key,
					entryFingerprint: 'changed',
				},
				new Set(['/app/pages/index.tsx']),
				async () => {
					throw new Error('build failed');
				},
			),
		).rejects.toThrow('build failed');

		const cached = await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => ({
			result: { entryAssets: [], chunkAssets: [] },
			dependencyPaths: new Set(['/app/pages/index.tsx']),
		}));

		expect(cached?.entryAssets[0]?.filepath).toBe('/assets/index.js');
	});

	test('does not commit stale graph when invalidated during in-flight build', async () => {
		const session = new SessionPageBrowserGraphCache();
		const contentFile = '/app/content/docs/intro.mdx';
		const key = {
			integrationName: 'react',
			routeFile: '/app/pages/index.tsx',
			dependencyInstanceKey: '',
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		let releaseFirstBuild: (() => void) | undefined;
		const firstBuildGate = new Promise<void>((resolve) => {
			releaseFirstBuild = resolve;
		});

		const firstBuild = session.resolveGraph(key, new Set(['/app/pages/index.tsx', contentFile]), async () => {
			await firstBuildGate;
			return {
				result: {
					entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/stale.js' }],
					chunkAssets: [],
				},
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});

		session.invalidateByFilePath(contentFile);

		releaseFirstBuild?.();
		await firstBuild;

		let rebuilds = 0;
		const freshResult = await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
			rebuilds += 1;
			return {
				result: {
					entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/fresh.js' }],
					chunkAssets: [],
				},
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});

		expect(freshResult?.entryAssets[0]?.filepath).toBe('/assets/fresh.js');
		expect(rebuilds).toBe(1);
	});

	test('invalidates only graphs that depend on the changed file', async () => {
		const session = new SessionPageBrowserGraphCache();
		const sharedLayout = '/app/src/layouts/root.tsx';

		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/a.tsx',
				dependencyInstanceKey: '',
				entryFingerprint: 'a',
				policy: 'development',
			},
			new Set(['/app/pages/a.tsx', sharedLayout]),
			async () => ({
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/a.tsx', sharedLayout]),
			}),
		);
		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/b.tsx',
				dependencyInstanceKey: '',
				entryFingerprint: 'b',
				policy: 'development',
			},
			new Set(['/app/pages/b.tsx']),
			async () => ({
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/b.tsx']),
			}),
		);

		session.invalidateByFilePath(sharedLayout);

		let rebuilds = 0;
		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/a.tsx',
				dependencyInstanceKey: '',
				entryFingerprint: 'a',
				policy: 'development',
			},
			new Set(['/app/pages/a.tsx', sharedLayout]),
			async () => {
				rebuilds += 1;
				return {
					result: { entryAssets: [], chunkAssets: [] },
					dependencyPaths: new Set(['/app/pages/a.tsx', sharedLayout]),
				};
			},
		);
		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/b.tsx',
				dependencyInstanceKey: '',
				entryFingerprint: 'b',
				policy: 'development',
			},
			new Set(['/app/pages/b.tsx']),
			async () => {
				rebuilds += 1;
				return {
					result: { entryAssets: [], chunkAssets: [] },
					dependencyPaths: new Set(['/app/pages/b.tsx']),
				};
			},
		);

		expect(rebuilds).toBe(1);
	});
});

test('PageBrowserGraphService warns when grouped assets lose groupedBundle metadata', async () => {
	vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx']);
	const warnSpy = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
	const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [
		{
			filepath: '/assets/index.js',
			kind: 'script',
			inline: false,
		},
	]);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;

	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const result = await service.resolvePageBrowserGraph({
		routeFile: '/app/pages/index.tsx',
		integrationName: 'react',
		collectContribution: async () => ({
			dependencies: [createGroupedDependency()],
		}),
	});

	expect(result?.entryAssets).toEqual([]);
	expect(warnSpy).toHaveBeenCalledWith(
		'Grouped page-browser assets for /app/pages/index.tsx are missing groupedBundle metadata after processing. Hydration scripts may be omitted from HTML.',
	);
});

test('PageBrowserGraphService reuses HMR graph records for unchanged requests', async () => {
	const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [
		{
			filepath: '/assets/index.js',
			kind: 'script',
			inline: false,
			sourceFilepath: '/app/pages/index.tsx',
		},
	]);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => true })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);

	const input = {
		routeFile: '/app/pages/index.tsx',
		integrationName: 'react',
		collectContribution: async () => ({
			dependencies: [
				{
					kind: 'script',
					source: 'file',
					filepath: '/app/pages/index.tsx',
				} satisfies AssetDefinition,
			],
		}),
	};

	await service.resolvePageBrowserGraph(input);
	await service.resolvePageBrowserGraph(input);

	expect(processDependencies).toHaveBeenCalledTimes(1);
});

test('rebuilds an existing graph when one render disables graph caching', async () => {
	const processDependencies = vi
		.fn()
		.mockResolvedValueOnce([
			{ filepath: '/assets/stale.js', kind: 'script', inline: false } satisfies ProcessedAsset,
		])
		.mockResolvedValueOnce([
			{ filepath: '/assets/fresh.js', kind: 'script', inline: false } satisfies ProcessedAsset,
		]);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const input = {
		routeFile: '/app/pages/index.tsx',
		integrationName: 'react',
		collectContribution: async () => ({
			dependencies: [
				{ kind: 'script', source: 'file', filepath: '/app/pages/index.tsx' } satisfies AssetDefinition,
			],
		}),
	};

	await service.resolvePageBrowserGraph(input);
	const freshGraph = await service.resolvePageBrowserGraph({ ...input, cacheable: false });

	expect(freshGraph?.entryAssets.map((asset) => asset.filepath)).toEqual(['/assets/fresh.js']);
	const cachedGraph = await service.resolvePageBrowserGraph(input);
	expect(cachedGraph?.entryAssets.map((asset) => asset.filepath)).toEqual(['/assets/stale.js']);
	expect(processDependencies).toHaveBeenCalledTimes(2);
});

test('createPageBrowserGraphEntryFingerprint includes direct contribution assets', () => {
	const withoutAssets = createPageBrowserGraphEntryFingerprint({
		dependencies: [{ kind: 'script', source: 'file', filepath: '/app/pages/index.tsx' }],
	});
	const withAssets = createPageBrowserGraphEntryFingerprint({
		dependencies: [{ kind: 'script', source: 'file', filepath: '/app/pages/index.tsx' }],
		assets: [{ kind: 'script', inline: true, content: 'console.log("inline")' }],
	});

	expect(withoutAssets).not.toBe(withAssets);
});

test('createPageBrowserGraphEntryFingerprint avoids cross-integration collisions', () => {
	const reactFingerprint = createPageBrowserGraphEntryFingerprint({
		dependencies: [{ kind: 'script', source: 'file', filepath: '/app/pages/index.tsx' }],
	});
	const kitaFingerprint = createPageBrowserGraphEntryFingerprint({
		dependencies: [{ kind: 'script', source: 'file', filepath: '/app/pages/index.kita.tsx' }],
	});

	expect(reactFingerprint).not.toBe(kitaFingerprint);
});

test('collectPageBrowserGraphDependencyPaths includes watch paths', () => {
	const dependencyPaths = collectPageBrowserGraphDependencyPaths(
		'/app/pages/docs/[...slug]/index.tsx',
		{
			watchPaths: ['/app/content/docs/intro.mdx', '/app/components/demo.tsx'],
		},
		[],
	);

	expect(dependencyPaths.has('/app/pages/docs/[...slug]/index.tsx')).toBe(true);
	expect(dependencyPaths.has('/app/content/docs/intro.mdx')).toBe(true);
	expect(dependencyPaths.has('/app/components/demo.tsx')).toBe(true);
});

test('collectPageBrowserGraphDependencyPaths includes bundled source paths', () => {
	const dependencyPaths = collectPageBrowserGraphDependencyPaths(
		'/app/pages/index.tsx',
		{
			dependencies: [{ kind: 'script', source: 'file', filepath: '/app/pages/index.tsx' }],
		},
		[
			{
				kind: 'script',
				inline: false,
				sourceFilepath: '/app/pages/index.tsx',
				bundledSourceFilepaths: ['/app/src/components/Button.tsx'],
			},
		],
	);

	expect(dependencyPaths.has('/app/pages/index.tsx')).toBe(true);
	expect(dependencyPaths.has('/app/src/components/Button.tsx')).toBe(true);
});

test('PageBrowserGraphService isolates graphs for sibling catch-all route instances', async () => {
	const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [
		{
			filepath: '/assets/demo.js',
			kind: 'script',
			inline: false,
		},
	]);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);

	const weatherResult = await service.resolvePageBrowserGraph({
		routeFile: '/app/pages/docs/[...slug]/index.tsx',
		dependencyInstanceKey: 'slug=examples/weather-app',
		integrationName: 'react',
		collectContribution: async () => ({
			assets: [{ kind: 'script', inline: false, filepath: '/assets/weather.js' }],
		}),
	});
	const todoResult = await service.resolvePageBrowserGraph({
		routeFile: '/app/pages/docs/[...slug]/index.tsx',
		dependencyInstanceKey: 'slug=examples/todo-app',
		integrationName: 'react',
		collectContribution: async () => ({
			assets: [{ kind: 'script', inline: false, filepath: '/assets/todo.js' }],
		}),
	});

	expect(weatherResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/weather.js' })]);
	expect(todoResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/todo.js' })]);
});

test('PageBrowserGraphService isolates query-dependent graph contributions', async () => {
	const assetProcessingService = {
		processDependencies: vi.fn(async (): Promise<ProcessedAsset[]> => []),
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const resolve = async (mode: string) =>
		await service.resolvePageBrowserGraph({
			routeFile: '/app/pages/docs/[...slug]/index.tsx',
			dependencyInstanceKey: createPageDependencyInstanceKey({
				params: { slug: ['docs', 'intro'] },
				query: { mode },
			}),
			integrationName: 'react',
			collectContribution: async () => ({
				assets: [{ kind: 'script', inline: false, filepath: `/assets/${mode}.js` }],
			}),
		});

	const [previewResult, publishedResult] = await Promise.all([resolve('preview'), resolve('published')]);

	expect(previewResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/preview.js' })]);
	expect(publishedResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/published.js' })]);
});

test('does not commit an in-flight graph after one of its watch paths changes', async () => {
	const contentFile = '/app/content/docs/intro.mdx';
	let releaseFirstBuild: (() => void) | undefined;
	const firstBuildGate = new Promise<void>((resolve) => {
		releaseFirstBuild = resolve;
	});
	let markFirstBuildStarted: (() => void) | undefined;
	const firstBuildStarted = new Promise<void>((resolve) => {
		markFirstBuildStarted = resolve;
	});
	let builds = 0;
	const assetProcessingService = {
		processDependencies: vi.fn(async (): Promise<ProcessedAsset[]> => {
			builds += 1;
			if (builds === 1) {
				markFirstBuildStarted?.();
				await firstBuildGate;
				return [{ kind: 'script', inline: false, filepath: '/assets/stale.js' }];
			}

			return [{ kind: 'script', inline: false, filepath: '/assets/fresh.js' }];
		}),
		getHmrManager: vi.fn(() => ({ isEnabled: () => true })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const input = {
		routeFile: '/app/pages/docs/[...slug]/index.tsx',
		dependencyInstanceKey: createPageDependencyInstanceKey({ params: { slug: ['docs', 'intro'] } }),
		integrationName: 'react',
		collectContribution: async () => ({
			dependencies: [{ kind: 'script' as const, source: 'file' as const, filepath: '/app/components/demo.tsx' }],
			watchPaths: [contentFile],
		}),
	};

	const staleBuild = service.resolvePageBrowserGraph(input);
	await firstBuildStarted;
	requireAppRuntime(appConfig).pageBrowserGraphSession.invalidateByFilePath(contentFile);
	releaseFirstBuild?.();
	await staleBuild;

	const freshResult = await service.resolvePageBrowserGraph(input);

	expect(freshResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/fresh.js' })]);
	expect(builds).toBe(2);
});

test('preserves processed grouped-asset order for a route', async () => {
	const routeFile = '/app/pages/docs/index.tsx';
	const dependencyInstanceKey = createPageDependencyInstanceKey({});
	const firstDependency: AssetDefinition = {
		kind: 'script',
		source: 'content',
		content: 'console.log("first")',
		name: 'first',
		groupedBundle: { id: 'docs', entryName: 'first' },
	};
	const secondDependency: AssetDefinition = {
		kind: 'script',
		source: 'content',
		content: 'console.log("second")',
		name: 'second',
		groupedBundle: { id: 'docs', entryName: 'second' },
	};
	const contribution = { dependencies: [firstDependency, secondDependency] };
	const assetProcessingService = {
		processDependencies: vi.fn(async (): Promise<ProcessedAsset[]> => [
			{
				kind: 'script',
				inline: false,
				filepath: '/assets/second.js',
				groupedBundle: secondDependency.groupedBundle,
			},
			{
				kind: 'script',
				inline: false,
				filepath: '/assets/first.js',
				groupedBundle: firstDependency.groupedBundle,
			},
		]),
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);

	const result = await service.resolvePageBrowserGraph({
		routeFile,
		dependencyInstanceKey,
		integrationName: 'react',
		collectContribution: async () => contribution,
	});

	expect(result?.entryAssets.map((asset) => asset.filepath)).toEqual(['/assets/second.js', '/assets/first.js']);
});

test('builds a route render override from its current grouped dependencies', async () => {
	const routeFile = '/app/pages/docs/index.tsx';
	const dependencyInstanceKey = '';
	const overrideDependency = { ...createGroupedDependency(), content: 'console.log("override")' };
	const overrideAsset: ProcessedAsset = {
		kind: 'script',
		inline: false,
		filepath: '/app/.eco/assets/override.js',
		srcUrl: '/assets/override.js',
		groupedBundle: { id: 'react-router-pages', entryName: 'index' },
	};
	const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [overrideAsset]);
	const service = new PageBrowserGraphService(appConfig, {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService);
	const result = await service.resolvePageBrowserGraph({
		routeFile,
		dependencyInstanceKey,
		integrationName: 'react',
		cacheable: false,
		collectContribution: async () => ({ dependencies: [overrideDependency] }),
	});

	expect(result?.entryAssets).toEqual([overrideAsset]);
	expect(processDependencies).toHaveBeenCalledWith([overrideDependency], appConfig.integrations?.[0]);
});

test('PageBrowserGraphService does not commit route graphs whose grouped scripts no app-wide build recorded', async () => {
	const routeFile = '/app/pages/docs/[...slug]/index.tsx';
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: { slug: ['docs', 'intro'] } });
	const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [
		{
			kind: 'script',
			inline: false,
			filepath: '/assets/intro.js',
			groupedBundle: { id: 'docs', entryName: 'intro' },
		},
	]);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const input = {
		routeFile,
		dependencyInstanceKey,
		integrationName: 'react',
		collectContribution: async () => ({
			dependencies: [createGroupedDependency()],
		}),
	};

	await service.resolvePageBrowserGraph(input);
	await service.resolvePageBrowserGraph(input);

	expect(processDependencies).toHaveBeenCalledTimes(2);
});

test('SessionPageBrowserGraphCache skips committing non-cacheable route graph builds', async () => {
	const session = new SessionPageBrowserGraphCache();
	let builds = 0;
	const key = {
		integrationName: 'react',
		routeFile: '/app/pages/index.tsx',
		dependencyInstanceKey: '',
		entryFingerprint: 'file:/app/pages/index.tsx',
		policy: 'production' as const,
	};

	await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
		builds += 1;
		return {
			result: {
				entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/stale.js' }],
				chunkAssets: [],
			},
			dependencyPaths: new Set(['/app/pages/index.tsx']),
			cacheable: false,
		};
	});
	await session.resolveGraph(key, new Set(['/app/pages/index.tsx']), async () => {
		builds += 1;
		return {
			result: {
				entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/fresh.js' }],
				chunkAssets: [],
			},
			dependencyPaths: new Set(['/app/pages/index.tsx']),
		};
	});

	expect(builds).toBe(2);
});

test('performs one graph build per cache key per request scope', async () => {
	const session = new SessionPageBrowserGraphCache();
	let builds = 0;

	const key = {
		integrationName: 'react',
		routeFile: '/app/pages/docs/[...slug].tsx',
		dependencyInstanceKey: 'slug:intro',
		entryFingerprint: 'file:/app/pages/docs/[...slug].tsx',
		policy: 'development' as const,
	};

	await session.resolveGraph(key, new Set(['/app/pages/docs/[...slug].tsx']), async () => {
		builds += 1;
		return {
			result: { entryAssets: [], chunkAssets: [] },
			dependencyPaths: new Set(['/app/pages/docs/[...slug].tsx']),
		};
	});
	await session.resolveGraph(key, new Set(['/app/pages/docs/[...slug].tsx']), async () => {
		builds += 1;
		return {
			result: { entryAssets: [], chunkAssets: [] },
			dependencyPaths: new Set(['/app/pages/docs/[...slug].tsx']),
		};
	});

	expect(builds).toBe(1);
});

describe('PageBrowserGraphService with an app-wide browser build', () => {
	const routeFile = '/app/pages/products/[slug].tsx';
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: { slug: 'new-product' } });
	const builtAsset: ProcessedAsset = {
		kind: 'script',
		inline: false,
		filepath: '/app/dist/client/assets/client-page.js',
		srcUrl: '/assets/client-page.js',
		groupedBundle: { id: 'react-router-pages', entryName: 'index' },
	};

	function createService(processDependencies: AssetProcessingService['processDependencies']) {
		return new PageBrowserGraphService(appConfig, {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService);
	}

	test('caches a graph whose grouped scripts the build recorded', async () => {
		requireAppRuntime(appConfig).processedAssets.recordBrowserOutputs([]);
		const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => [builtAsset]);
		const service = createService(processDependencies);
		const input = {
			routeFile,
			dependencyInstanceKey,
			integrationName: 'react',
			collectContribution: async () => ({ dependencies: [createGroupedDependency()] }),
		};

		expect((await service.resolvePageBrowserGraph(input))?.entryAssets).toEqual([builtAsset]);
		await service.resolvePageBrowserGraph(input);

		expect(processDependencies).toHaveBeenCalledOnce();
	});

	test('serves a sealed production request whose grouped scripts the ledger records', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const runtime = requireAppRuntime(appConfig);
		runtime.processedAssets.record(createGroupedDependency(), builtAsset);
		runtime.processedAssets.recordBrowserOutputs([]);
		runtime.productionBrowserGraphsSealed = true;
		const service = createService(vi.fn(async (): Promise<ProcessedAsset[]> => [builtAsset]));

		const result = await service.resolvePageBrowserGraph({
			routeFile,
			dependencyInstanceKey,
			integrationName: 'react',
			collectContribution: async () => ({ dependencies: [createGroupedDependency()] }),
		});

		expect(result?.entryAssets).toEqual([builtAsset]);
	});

	test('fails a sealed production request whose grouped script the ledger does not record, naming the route', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const runtime = requireAppRuntime(appConfig);
		runtime.processedAssets.record(createGroupedDependency(), builtAsset);
		runtime.processedAssets.recordBrowserOutputs([]);
		runtime.productionBrowserGraphsSealed = true;
		const processDependencies = vi.fn(async (): Promise<ProcessedAsset[]> => {
			throw new Error('production must not build browser assets');
		});
		const service = createService(processDependencies);

		await expect(
			service.resolvePageBrowserGraph({
				routeFile,
				dependencyInstanceKey,
				integrationName: 'react',
				collectContribution: async () => ({
					dependencies: [{ ...createGroupedDependency(), content: 'console.log("new product island")' }],
				}),
			}),
		).rejects.toThrow(
			'The production Page Browser Graph for /app/pages/products/[slug].tsx is missing from the production asset ledger (entry slug=new-product). Run `ecopages build` again.',
		);
		expect(processDependencies).not.toHaveBeenCalled();
	});
});
