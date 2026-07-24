import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';
import {
	collectPageBrowserGraphDependencyPaths,
	createPageBrowserGraphEntryFingerprint,
	getAppPageBrowserGraphSession,
	SessionPageBrowserGraphCache,
} from './page-browser-graph-session.ts';
import { PageBrowserGraphService } from './page-browser-graph.service.ts';
import { createGroupedGraphBuildPlanKey } from './grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from './route-instance-key.ts';

const appConfig = {
	integrations: [{ name: 'react', extensions: ['.tsx'] }],
	absolutePaths: {
		pagesDir: '/app/pages',
	},
} as unknown as EcoPagesAppConfig;

function createGroupedDependency(): AssetDefinition {
	return {
		kind: 'script',
		source: 'content',
		content: 'console.log("hydrate")',
		name: 'page-entry',
		groupedBundle: { id: 'react-router-pages', entryName: 'index' },
	};
}

function isGroupedContentScriptDependency(asset: AssetDefinition): asset is Extract<
	AssetDefinition,
	{ kind: 'script'; source: 'content' }
> & {
	groupedBundle: { id: string; entryName: string };
} {
	return asset.kind === 'script' && asset.source === 'content' && Boolean(asset.groupedBundle);
}

afterEach(() => {
	vi.restoreAllMocks();
	getAppPageBrowserGraphSession(appConfig).resetForTests();
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

	test('reuses grouped graph records across pages in the same integration', async () => {
		const session = new SessionPageBrowserGraphCache();
		let groupedBuilds = 0;
		const scope = {
			integrationName: 'react',
			planKey: 'shared-plan',
		};

		await session.resolveGroupedGraph(scope, async () => {
			groupedBuilds += 1;
			return {
				assetsByRoute: new Map([
					['/app/pages/a.tsx', [{ kind: 'script', inline: false, filepath: '/assets/a.js' }]],
					['/app/pages/b.tsx', [{ kind: 'script', inline: false, filepath: '/assets/b.js' }]],
				]),
				dependencyPaths: new Set(['/app/pages/a.tsx', '/app/pages/b.tsx']),
				generation: 0,
			};
		});

		await session.resolveGroupedGraph(scope, async () => {
			groupedBuilds += 1;
			return {
				skipCache: true,
				assetsByRoute: new Map(),
				dependencyPaths: new Set(),
			};
		});

		expect(groupedBuilds).toBe(1);
	});

	test('shares grouped graph records across dependency instances', async () => {
		const session = new SessionPageBrowserGraphCache();
		let groupedBuilds = 0;

		await session.resolveGroupedGraph(
			{
				integrationName: 'react',
				planKey: 'shared-plan',
			},
			async () => {
				groupedBuilds += 1;
				return {
					assetsByRoute: new Map([
						[
							'/app/pages/docs/[...slug]/index.tsx::slug=examples/weather-app',
							[{ kind: 'script', inline: false, filepath: '/assets/weather.js' }],
						],
					]),
					dependencyPaths: new Set(['/app/pages/docs/[...slug]/index.tsx']),
					generation: 0,
				};
			},
		);

		const second = await session.resolveGroupedGraph(
			{
				integrationName: 'react',
				planKey: 'shared-plan',
			},
			async () => {
				groupedBuilds += 1;
				return {
					assetsByRoute: new Map([
						[
							'/app/pages/docs/[...slug]/index.tsx::slug=examples/todo-app',
							[{ kind: 'script', inline: false, filepath: '/assets/todo.js' }],
						],
					]),
					dependencyPaths: new Set(['/app/pages/docs/[...slug]/index.tsx']),
					generation: 0,
				};
			},
		);

		expect(groupedBuilds).toBe(1);
		expect(second).toEqual(
			new Map([
				[
					'/app/pages/docs/[...slug]/index.tsx::slug=examples/weather-app',
					[{ kind: 'script', inline: false, filepath: '/assets/weather.js' }],
				],
			]),
		);
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
	getAppPageBrowserGraphSession(appConfig).invalidateByFilePath(contentFile);
	releaseFirstBuild?.();
	await staleBuild;

	const freshResult = await service.resolvePageBrowserGraph(input);

	expect(freshResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/fresh.js' })]);
	expect(builds).toBe(2);
});

test('processes grouped assets once for a large set of static dependency instances', async () => {
	const routeFile = '/app/pages/docs/[...slug]/index.tsx';
	const instances = Array.from({ length: 1_000 }, (_, index) => {
		const slug = `entry-${index}`;
		const dependencyInstanceKey = createPageDependencyInstanceKey({ params: { slug: ['docs', slug] } });
		const groupedDependency: AssetDefinition = {
			kind: 'script',
			source: 'content',
			content: `console.log(${JSON.stringify(slug)})`,
			name: slug,
			groupedBundle: { id: 'docs', entryName: slug },
		};

		return {
			slug,
			dependencyInstanceKey,
			contribution: { dependencies: [groupedDependency] },
		};
	});
	const processDependencies = vi.fn(async (dependencies: AssetDefinition[]): Promise<ProcessedAsset[]> =>
		dependencies.filter(isGroupedContentScriptDependency).map((dependency) => ({
			kind: 'script',
			inline: false,
			filepath: `/assets/${dependency.groupedBundle.entryName}.js`,
			groupedBundle: dependency.groupedBundle,
		})),
	);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const groupedContributions = instances.map(({ dependencyInstanceKey, contribution }) => ({
		routeFile,
		dependencyInstanceKey,
		contribution,
	}));

	const groupedBuildPlan = {
		integrationName: 'react',
		planKey: createGroupedGraphBuildPlanKey('react', groupedContributions),
		instances: groupedContributions,
	};

	for (const instance of instances) {
		const result = await service.resolvePageBrowserGraph({
			routeFile,
			dependencyInstanceKey: instance.dependencyInstanceKey,
			integrationName: 'react',
			collectContribution: async () => instance.contribution,
			groupedBuildPlan,
		});

		expect(result?.entryAssets).toEqual([expect.objectContaining({ filepath: `/assets/${instance.slug}.js` })]);
	}

	expect(processDependencies).toHaveBeenCalledOnce();
	expect(processDependencies.mock.calls[0]?.[0]).toHaveLength(1_000);
});

test('PageBrowserGraphService does not commit route graphs built without a grouped plan', async () => {
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

test('PageBrowserGraphService scopes grouped caches to build-plan identity', async () => {
	const routeFile = '/app/pages/docs/[...slug]/index.tsx';
	const createInstance = (slug: string) => {
		const dependencyInstanceKey = createPageDependencyInstanceKey({ params: { slug: ['docs', slug] } });
		const groupedDependency: AssetDefinition = {
			kind: 'script',
			source: 'content',
			content: `console.log(${JSON.stringify(slug)})`,
			name: slug,
			groupedBundle: { id: 'docs', entryName: slug },
		};

		return {
			routeFile,
			dependencyInstanceKey,
			contribution: { dependencies: [groupedDependency] },
			slug,
		};
	};
	const partialInstance = createInstance('intro');
	const completeInstances = [partialInstance, createInstance('guide')];
	const processDependencies = vi.fn(async (dependencies: AssetDefinition[]): Promise<ProcessedAsset[]> =>
		dependencies.filter(isGroupedContentScriptDependency).map((dependency) => ({
			kind: 'script',
			inline: false,
			filepath: `/assets/${dependency.groupedBundle.entryName}.js`,
			groupedBundle: dependency.groupedBundle,
		})),
	);
	const assetProcessingService = {
		processDependencies,
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	} as unknown as AssetProcessingService;
	const service = new PageBrowserGraphService(appConfig, assetProcessingService);
	const partialPlan = {
		integrationName: 'react',
		planKey: createGroupedGraphBuildPlanKey('react', [partialInstance]),
		instances: [partialInstance],
	};
	const completePlan = {
		integrationName: 'react',
		planKey: createGroupedGraphBuildPlanKey('react', completeInstances),
		instances: completeInstances,
	};

	await service.resolvePageBrowserGraph({
		routeFile,
		dependencyInstanceKey: partialInstance.dependencyInstanceKey,
		integrationName: 'react',
		collectContribution: async () => partialInstance.contribution,
		groupedBuildPlan: partialPlan,
	});
	const guideResult = await service.resolvePageBrowserGraph({
		routeFile,
		dependencyInstanceKey: completeInstances[1]!.dependencyInstanceKey,
		integrationName: 'react',
		collectContribution: async () => completeInstances[1]!.contribution,
		groupedBuildPlan: completePlan,
	});

	expect(guideResult?.entryAssets).toEqual([expect.objectContaining({ filepath: '/assets/guide.js' })]);
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
