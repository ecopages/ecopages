import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import {
	collectPageBrowserGraphDependencyPaths,
	createPageBrowserGraphEntryFingerprint,
	getAppPageBrowserGraphSession,
	SessionPageBrowserGraphCache,
} from './page-browser-graph-session.ts';
import { PageBrowserGraphService } from './page-browser-graph.service.ts';

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
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		const first = await session.resolveGraph(key, async () => {
			builds += 1;
			return {
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});
		const second = await session.resolveGraph(key, async () => {
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
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		const build = session.resolveGraph(key, async () => {
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
		const concurrent = session.resolveGraph(key, async () => {
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
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		await session.resolveGraph(key, async () => ({
			result: { entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/index.js' }], chunkAssets: [] },
			dependencyPaths: new Set(['/app/pages/index.tsx']),
		}));

		await expect(
			session.resolveGraph(
				{
					...key,
					entryFingerprint: 'changed',
				},
				async () => {
					throw new Error('build failed');
				},
			),
		).rejects.toThrow('build failed');

		const cached = await session.resolveGraph(key, async () => ({
			result: { entryAssets: [], chunkAssets: [] },
			dependencyPaths: new Set(['/app/pages/index.tsx']),
		}));

		expect(cached?.entryAssets[0]?.filepath).toBe('/assets/index.js');
	});

	test('does not commit stale graph when invalidated during in-flight build', async () => {
		const session = new SessionPageBrowserGraphCache();
		const key = {
			integrationName: 'react',
			routeFile: '/app/pages/index.tsx',
			entryFingerprint: 'file:/app/pages/index.tsx',
			policy: 'development' as const,
		};

		let releaseFirstBuild: (() => void) | undefined;
		const firstBuildGate = new Promise<void>((resolve) => {
			releaseFirstBuild = resolve;
		});

		const firstBuild = session.resolveGraph(key, async () => {
			await firstBuildGate;
			return {
				result: {
					entryAssets: [{ kind: 'script', inline: false, filepath: '/assets/stale.js' }],
					chunkAssets: [],
				},
				dependencyPaths: new Set(['/app/pages/index.tsx']),
			};
		});

		session.invalidateByFilePath('/app/pages/index.tsx');

		releaseFirstBuild?.();
		await firstBuild;

		let rebuilds = 0;
		const freshResult = await session.resolveGraph(key, async () => {
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

		await session.resolveGroupedGraph('react', async () => {
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

		await session.resolveGroupedGraph('react', async () => {
			groupedBuilds += 1;
			return {
				skipCache: true,
				assetsByRoute: new Map(),
				dependencyPaths: new Set(),
			};
		});

		expect(groupedBuilds).toBe(1);
	});

	test('invalidates only graphs that depend on the changed file', async () => {
		const session = new SessionPageBrowserGraphCache();
		const sharedLayout = '/app/src/layouts/root.tsx';

		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/a.tsx',
				entryFingerprint: 'a',
				policy: 'development',
			},
			async () => ({
				result: { entryAssets: [], chunkAssets: [] },
				dependencyPaths: new Set(['/app/pages/a.tsx', sharedLayout]),
			}),
		);
		await session.resolveGraph(
			{
				integrationName: 'react',
				routeFile: '/app/pages/b.tsx',
				entryFingerprint: 'b',
				policy: 'development',
			},
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
				entryFingerprint: 'a',
				policy: 'development',
			},
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
				entryFingerprint: 'b',
				policy: 'development',
			},
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
