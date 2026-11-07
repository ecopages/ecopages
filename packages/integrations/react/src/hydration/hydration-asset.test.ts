import path from 'node:path';
import { contentHash } from '@ecopages/core/build';
import { DEV_TRANSFORM_URL_PREFIX } from '@ecopages/core/integration';
import { describe, expect, it, vi } from 'vitest';
import { APP_BROWSER_CLIENT_BUNDLE_ID } from '@ecopages/core/integration';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import { getIslandComponentKey, HydrationAssetService } from './hydration-asset.ts';

type HydrationAssetServiceOptions = ConstructorParameters<typeof HydrationAssetService>[0];

/**
 * Casts a partial collaborator double to the constructor option type.
 *
 * @remarks
 * Each test supplies only the methods the code under test calls, so a missing method surfaces as a runtime error in that test.
 */
const fake = <T>(partial: object): T => partial as T;

const devTransformPageUrl = (relativePath: string): string => `${DEV_TRANSFORM_URL_PREFIX}/${relativePath}`;

const routerAdapter: ReactRouterAdapter = {
	name: 'eco-router',
	importPath: '@ecopages/react-router/browser',
	components: {
		router: 'EcoRouter',
		pageContent: 'PageContent',
	},
	getRouterProps: () => '{}',
};

/** A path of the `/app` root of these tests, relative to it as entry names and keys hash it. */
const sourceKey = (file: string) => path.relative(path.resolve('/app'), path.resolve(file)).split(path.sep).join('/');
const islandBundleName = (file: string) =>
	`ecopages-react-island-${BigInt(`0x${contentHash(sourceKey(file), 16)}`).toString()}`;

const contentOf = (dependency: unknown): string => String((dependency as { content?: string }).content ?? '');

/** Package specifiers a generated entry imports. */
const importedSpecifiers = (source: string): string[] =>
	[...source.matchAll(/from "([^"]+)"/g)]
		.map((match) => match[1]!)
		.filter((specifier) => !path.isAbsolute(JSON.parse(`"${specifier}"`)));

describe('HydrationAssetService', () => {
	it('makes a Page entry without a router an entry of the app-wide browser build', async () => {
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({}),
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/index.tsx',
			componentName: 'ecopages-react-index',
			importPath: '/assets/pages/index.js',
			pageModuleUrlExpression: 'import.meta.url',
			bundleOptions: {},
			hmrEnabled: false,
			isMdx: false,
		});

		expect(dependencies).toHaveLength(1);
		expect(dependencies[0]).toMatchObject({
			kind: 'script',
			source: 'content',
			name: 'ecopages-react-index',
			packageRole: 'page-script',
			bundle: true,
			groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName: 'pages__index' },
			attributes: {
				type: 'module',
				defer: '',
				'data-eco-rerun': 'true',
				'data-eco-script-id': 'ecopages-react-index',
				'data-eco-persist': 'true',
			},
		});
		expect(importedSpecifiers(contentOf(dependencies[0]))).toEqual([
			'react-dom/client',
			'react',
			'@ecopages/react/page-hydration',
			'@ecopages/react/layout-compose',
		]);
	});

	it('groups router-managed page entries under a stable shared bundle id', async () => {
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			routerAdapter,
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({}),
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/dashboard/[project].tsx',
			componentName: 'ecopages-react-dashboard',
			importPath: '/assets/pages/dashboard.js',
			pageModuleUrlExpression: 'import.meta.url',
			bundleOptions: {},
			hmrEnabled: false,
			isMdx: false,
		});

		expect(dependencies[0]).toMatchObject({
			bundle: true,
			groupedBundle: {
				id: APP_BROWSER_CLIENT_BUNDLE_ID,
				entryName: 'pages__dashboard___project_',
			},
			attributes: {
				'data-eco-page-bootstrap': 'react-router',
			},
		});
		expect(contentOf(dependencies[0])).toContain('from "@ecopages/react-router/browser"');
	});

	it('collects island hydration entries that import their source into the app-wide build', async () => {
		const createBundleOptions = vi.fn(async () => ({ plugins: [] }));
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({ createBundleOptions }),
		});
		const islandA = path.resolve('/app/src/components/island-a.tsx');
		const islandB = path.resolve('/app/src/components/island-b.tsx');

		const entries = await service.collectAppBrowserClientBuildEntries([
			{ file: islandA, config: { dependencies: { modules: ['node:path'] } } },
			{ file: islandB, config: { dependencies: { modules: ['node:fs'] } } },
		]);

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			dependency: {
				kind: 'script',
				bundle: true,
				groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID },
			},
		});
		expect(contentOf(entries[0]?.dependency)).toContain(JSON.stringify(islandA));
		expect(importedSpecifiers(contentOf(entries[0]?.dependency))).toEqual([
			'react-dom/client',
			'react',
			'@ecopages/react/island-hydration',
		]);
		expect(contentOf(entries[1]?.dependency)).toContain(JSON.stringify(islandB));
		expect(createBundleOptions).toHaveBeenNthCalledWith(
			1,
			islandBundleName(islandA),
			['node:path'],
			islandA,
			[islandA, islandB],
			['node:path', 'node:fs'],
		);
		expect(createBundleOptions).toHaveBeenNthCalledWith(
			2,
			islandBundleName(islandB),
			['node:fs'],
			islandB,
			[islandA, islandB],
			['node:path', 'node:fs'],
		);
	});

	it('keeps router-managed page bootstraps unbundled in development and imports packages by name', async () => {
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			routerAdapter,
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => ({ isEnabled: () => true }),
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({}),
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/docs/index.tsx',
			componentName: 'ecopages-react-docs',
			importPath: devTransformPageUrl('pages/docs/index.js'),
			pageModuleUrlExpression: `"${devTransformPageUrl('pages/docs/index.js')}"`,
			bundleOptions: {},
			hmrEnabled: true,
			isMdx: false,
		});

		const content = contentOf(dependencies[0]);
		expect(dependencies[0]).toMatchObject({
			bundle: false,
			groupedBundle: undefined,
			attributes: {
				'data-eco-page-bootstrap': 'react-router',
			},
		});
		expect(content).toContain(`from "${devTransformPageUrl('pages/docs/index.js')}"`);
		expect(importedSpecifiers(content)).toEqual([
			'react-dom/client',
			'react',
			'@ecopages/react/page-hydration',
			'@ecopages/react-router/browser',
		]);
	});

	it('imports MDX layout normalization from the core browser entry', async () => {
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			routerAdapter,
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => ({ isEnabled: () => true }),
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({}),
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/react-content.mdx',
			componentName: 'ecopages-react-mdx',
			importPath: devTransformPageUrl('pages/react-content.js'),
			pageModuleUrlExpression: `"${devTransformPageUrl('pages/react-content.js')}"`,
			bundleOptions: {},
			hmrEnabled: true,
			isMdx: true,
		});

		const content = contentOf(dependencies[0]);
		expect(dependencies[0]).toMatchObject({ bundle: false });
		expect(content).toContain('import { ensurePageConfigLayouts } from "@ecopages/core/client";');
		expect(content).toContain(`from "${devTransformPageUrl('pages/react-content.js')}"`);
	});

	it.each([
		{ label: 'without a router', adapter: undefined },
		{ label: 'with a router', adapter: routerAdapter },
	])('bundles a production Page entry $label with code splitting', async ({ adapter }) => {
		vi.stubEnv('NODE_ENV', 'production');
		const createBundleOptions = vi.fn(async () => ({ plugins: [] }));
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			routerAdapter: adapter,
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({ createBundleOptions }),
		});

		const dependencies = await service.createPageBrowserGraphDependencies('/app/src/pages/index.tsx', false, []);

		expect(createBundleOptions).toHaveBeenCalledWith(
			`ecopages-react-${BigInt(`0x${contentHash('src/pages/index.tsx', 16)}`).toString()}`,
			[],
			'/app/src/pages/index.tsx',
		);
		expect(dependencies[0]).toMatchObject({
			bundle: true,
			groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID },
			bundleOptions: { plugins: [], splitting: true },
		});
		expect(contentOf(dependencies[0])).not.toContain('hmr: {');
	});

	it('uses the React-owned HMR entrypoint path for hydration assets in development', async () => {
		const pageModuleUrl = devTransformPageUrl('pages/index.js');
		const registerScriptEntrypoint = vi.fn(async () => pageModuleUrl);
		const registerEntrypoint = vi.fn(async () => pageModuleUrl);
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => ({
					isEnabled: () => true,
					registerScriptEntrypoint,
					registerEntrypoint,
				}),
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({}),
		});

		const importPath = await service.resolveAssetImportPath('/app/src/pages/index.tsx', 'ecopages-react-index');

		expect(importPath).toBe(pageModuleUrl);
		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/pages/index.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
	});

	it('records the HMR entrypoint as the active page module in development', async () => {
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => ({
					isEnabled: () => true,
					registerEntrypoint: async () => devTransformPageUrl('pages/index.js'),
					registerScriptEntrypoint: async () => '/assets/scripts/index.js',
				}),
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({
				createBundleOptions: async () => ({}),
			}),
		});

		const dependencies = await service.createPageBrowserGraphDependencies('/app/src/pages/index.tsx', false, []);

		expect(dependencies[0]).toMatchObject({
			bundle: false,
			content: expect.stringContaining(`const pageModuleUrl = "${devTransformPageUrl('pages/index.js')}";`),
		});
	});

	it('uses dev transform for island hydration without a duplicate HMR disk bundle', async () => {
		const registerScriptEntrypoint = vi.fn();
		const registerEntrypoint = vi.fn(async () => '/assets/__eco_dev__/components/counter.js');
		const processDependencies = vi.fn(async () => []);
		const assetProcessingIntegration = { name: 'react' };
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingIntegration,
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => ({
					isEnabled: () => true,
					registerEntrypoint,
					registerScriptEntrypoint,
				}),
				processDependencies,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({
				createBundleOptions: vi.fn(),
			}),
			hmrPageMetadataCache: fake<HydrationAssetServiceOptions['hmrPageMetadataCache']>({
				markOwnedEntrypoint: vi.fn(),
			}),
		});

		await service.buildPageClientAssets({
			islands: [
				{
					file: path.resolve('/app/src/components/counter.tsx'),
					config: {
						identity: {
							id: 'Counter',
							file: path.resolve('/app/src/components/counter.tsx'),
							integration: 'react',
						},
					},
				},
			],
		});

		expect(registerEntrypoint).toHaveBeenCalledWith(path.resolve('/app/src/components/counter.tsx'));
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
		expect(processDependencies).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					kind: 'script',
					bundle: false,
					content: expect.stringContaining('registerIslandHmr'),
				}),
			],
			assetProcessingIntegration,
		);
	});

	it('builds the hydration entries of two islands in one grouped client build', async () => {
		const islandA = path.resolve('/app/src/components/counter.tsx');
		const islandB = path.resolve('/app/src/components/cart.tsx');
		const assetProcessingIntegration = { name: 'react' };
		const processDependencies = vi.fn(
			async (deps: Array<{ groupedBundle?: { entryName: string } }>, _integration?: { name: string }) =>
				deps.map((dep) => ({
					kind: 'script' as const,
					srcUrl: `/assets/${dep.groupedBundle?.entryName}.js`,
					groupedBundle: dep.groupedBundle,
				})),
		);
		const createBundleOptions = vi.fn(async () => ({}));
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingIntegration,
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
				processDependencies,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({ createBundleOptions }),
		});
		const counter = { identity: { id: 'Counter', file: islandA, integration: 'react' } };
		const cart = { identity: { id: 'Cart', file: islandB, integration: 'react' } };

		const processedAssets = await service.buildPageClientAssets({
			islands: [
				{ file: islandA, config: counter },
				{ file: islandB, config: cart },
			],
		});

		expect(processDependencies).toHaveBeenCalledTimes(1);
		const [clientEntries, processingIntegration] = processDependencies.mock.calls[0] as unknown as [
			Array<{ bundle?: boolean; groupedBundle?: { id: string; entryName: string }; content?: string }>,
			{ name: string } | undefined,
		];
		expect(processingIntegration).toBe(assetProcessingIntegration);
		expect(clientEntries.map((entry) => [entry.bundle, entry.groupedBundle?.id])).toEqual([
			[true, APP_BROWSER_CLIENT_BUNDLE_ID],
			[true, APP_BROWSER_CLIENT_BUNDLE_ID],
		]);
		expect(clientEntries[0]?.content).toContain(`import * as ComponentModule from ${JSON.stringify(islandA)}`);
		expect(clientEntries[1]?.content).toContain(`import * as ComponentModule from ${JSON.stringify(islandB)}`);
		expect(processedAssets.map((asset) => asset.srcUrl)).toEqual([
			`/assets/${islandBundleName(islandA)}-hydration-${getIslandComponentKey(sourceKey(islandA), counter)}.js`,
			`/assets/${islandBundleName(islandB)}-hydration-${getIslandComponentKey(sourceKey(islandB), cart)}.js`,
		]);
	});

	it('hydrates two islands declared in one file as themselves', async () => {
		const file = path.resolve('/app/src/components/widgets.tsx');
		const processDependencies = vi.fn(async (deps: Array<{ content?: string }>) =>
			deps.map((dep) => ({ kind: 'script' as const, content: dep.content })),
		);
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
				processDependencies,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({
				createBundleOptions: vi.fn(async () => ({})),
			}),
		});
		const counter = { identity: { id: 'counter', file, integration: 'react' } };
		const cart = { identity: { id: 'cart', file, integration: 'react' } };

		const processedAssets = await service.buildPageClientAssets({
			islands: [
				{ file, config: counter },
				{ file, config: cart },
			],
		});

		const hydration = processedAssets.map((asset) => asset.content ?? '');
		expect(hydration).toHaveLength(2);
		expect(hydration[0]).toContain(getIslandComponentKey(sourceKey(file), counter));
		expect(hydration[0]).toContain('componentRef: "counter"');
		expect(hydration[1]).toContain(getIslandComponentKey(sourceKey(file), cart));
		expect(hydration[1]).toContain('componentRef: "cart"');
	});

	it('reuses the same grouped entry name for different component instances', async () => {
		const file = path.resolve('/app/src/components/counter.tsx');
		const config = { identity: { id: 'Counter', file, integration: 'react' } };
		const processDependencies = vi.fn(async (deps: unknown[]) => deps.map(() => ({ kind: 'script' as const })));
		const service = new HydrationAssetService({
			rootDir: '/app',
			srcDir: '/app/src',
			assetProcessingService: fake<HydrationAssetServiceOptions['assetProcessingService']>({
				getHmrManager: () => undefined,
				processDependencies,
			}),
			bundleService: fake<HydrationAssetServiceOptions['bundleService']>({
				createBundleOptions: vi.fn(async () => ({})),
			}),
		});

		await service.buildPageClientAssets({ islands: [{ file, config }] });
		await service.buildPageClientAssets({ islands: [{ file, config }] });

		const entryName = `${islandBundleName(file)}-hydration-${getIslandComponentKey(sourceKey(file), config)}`;
		const entries = processDependencies.mock.calls.map(
			([deps]) =>
				(
					deps as Array<{
						name?: string;
						groupedBundle?: { entryName: string };
						attributes?: Record<string, string>;
					}>
				)[0],
		);
		expect(entries.map((entry) => entry?.groupedBundle?.entryName)).toEqual([entryName, entryName]);
		expect(entries[0]?.attributes?.['data-eco-script-id']).toBe(entries[0]?.name);
	});
});
