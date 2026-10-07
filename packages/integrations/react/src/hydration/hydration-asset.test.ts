import { rapidhash } from '@ecopages/core/hash';
import { DEV_TRANSFORM_URL_PREFIX } from '@ecopages/core/dev/transform-server';
import { describe, expect, it, vi } from 'vitest';
import { assertNoBareEcopagesImports } from './assert-no-bare-ecopages-imports.ts';
import { APP_BROWSER_CLIENT_BUNDLE_ID } from '@ecopages/core/services/asset-processing-service';
import { getIslandComponentKey, HydrationAssetService } from './hydration-asset.ts';

const devTransformPageUrl = (relativePath: string): string => `${DEV_TRANSFORM_URL_PREFIX}/${relativePath}`;

const productionRuntimeImports = {
	react: 'react',
	reactDomClient: 'react-dom/client',
	reactJsxRuntime: 'react',
	reactJsxDevRuntime: 'react',
	reactDom: 'react-dom',
	useSyncExternalStoreWithSelector: 'use-sync-external-store/shim/with-selector',
	pageLayoutNormalization: '@ecopages/core/eco/page-layout-normalization',
	layoutCompose: '@ecopages/react/layout-compose',
	router: undefined as string | undefined,
};

const browserRuntimeImports = {
	react: '/assets/vendors/react.js',
	reactDomClient: '/assets/vendors/react-dom.js',
	reactJsxRuntime: '/assets/vendors/react.js',
	reactJsxDevRuntime: '/assets/vendors/react.js',
	reactDom: '/assets/vendors/react-dom.js',
	useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.js',
	pageLayoutNormalization: '/assets/vendors/page-layout-normalization.js',
	layoutCompose: '/assets/vendors/layout-compose.js',
	router: '/assets/vendors/react-router-esm.js' as string | undefined,
};

describe('HydrationAssetService', () => {
	it('creates one page-owned route entry asset', async () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
			} as any,
			bundleService: {
				getRuntimeImports: () => productionRuntimeImports,
			} as any,
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/index.tsx',
			componentName: 'ecopages-react-index',
			importPath: '/assets/pages/index.js',
			pageModuleUrlExpression: 'import.meta.url',
			bundleOptions: {},
			hmrEnabled: false,
			useBrowserRuntimeImports: false,
			isMdx: false,
		});

		expect(dependencies).toHaveLength(1);
		expect(dependencies[0]).toMatchObject({
			kind: 'script',
			source: 'content',
			name: 'ecopages-react-index',
			packageRole: 'page-script',
			bundle: true,
			attributes: {
				type: 'module',
				defer: '',
				'data-eco-rerun': 'true',
				'data-eco-script-id': 'ecopages-react-index',
				'data-eco-persist': 'true',
			},
		});
	});

	it('groups router-managed page entries under a stable shared bundle id', async () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: [],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
			assetProcessingService: {
				getHmrManager: () => undefined,
			} as any,
			bundleService: {
				getRuntimeImports: () => browserRuntimeImports,
			} as any,
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/dashboard/[project].tsx',
			componentName: 'ecopages-react-dashboard',
			importPath: '/assets/pages/dashboard.js',
			pageModuleUrlExpression: 'import.meta.url',
			bundleOptions: {},
			hmrEnabled: false,
			useBrowserRuntimeImports: true,
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
	});

	it('keeps router-managed page bootstraps unbundled in development with vendor helper imports', async () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: [],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
			assetProcessingService: {
				getHmrManager: () => ({ isEnabled: () => true }),
			} as any,
			bundleService: {
				getRuntimeImports: () => browserRuntimeImports,
			} as any,
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/docs/index.tsx',
			componentName: 'ecopages-react-docs',
			importPath: devTransformPageUrl('pages/docs/index.js'),
			pageModuleUrlExpression: `"${devTransformPageUrl('pages/docs/index.js')}"`,
			bundleOptions: {
				external: ['/assets/vendors/react-router-esm.js'],
			},
			hmrEnabled: true,
			useBrowserRuntimeImports: true,
			isMdx: false,
		});

		const content = String((dependencies[0] as { content?: string }).content ?? '');
		expect(dependencies[0]).toMatchObject({
			bundle: false,
			groupedBundle: undefined,
			bundleOptions: {
				external: ['/assets/vendors/react-router-esm.js'],
			},
			attributes: {
				'data-eco-page-bootstrap': 'react-router',
			},
		});
		expect(content).toContain(`from "${devTransformPageUrl('pages/docs/index.js')}"`);
		assertNoBareEcopagesImports(content);
	});

	it('emits vendor URLs for MDX layout normalization in unbundled HMR bootstraps', async () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: [],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
			assetProcessingService: {
				getHmrManager: () => ({ isEnabled: () => true }),
			} as any,
			bundleService: {
				getRuntimeImports: () => browserRuntimeImports,
			} as any,
		});

		const dependencies = await service.createPageDependencies({
			pagePath: '/app/src/pages/react-content.mdx',
			componentName: 'ecopages-react-mdx',
			importPath: devTransformPageUrl('pages/react-content.js'),
			pageModuleUrlExpression: `"${devTransformPageUrl('pages/react-content.js')}"`,
			bundleOptions: {},
			hmrEnabled: true,
			useBrowserRuntimeImports: true,
			isMdx: true,
		});

		const content = String((dependencies[0] as { content?: string }).content ?? '');
		expect(dependencies[0]).toMatchObject({
			bundle: false,
		});
		expect(content).toContain('from "/assets/vendors/page-layout-normalization.js"');
		expect(content).toContain(`from "${devTransformPageUrl('pages/react-content.js')}"`);
		assertNoBareEcopagesImports(content);
	});

	it('bundles the React runtime into production page browser graph entries', async () => {
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		const createBundleOptions = vi.fn(async () => ({}));
		const processDependencies = vi.fn(async () => []);
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as any,
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({ ...productionRuntimeImports, router: undefined }),
			} as any,
		});

		try {
			await service.createPageBrowserGraphDependencies('/app/src/pages/index.tsx', false, []);

			expect(createBundleOptions).toHaveBeenCalledWith(
				`ecopages-react-${rapidhash('/app/src/pages/index.tsx')}`,
				false,
				[],
				{
					includeRuntime: true,
					splitting: false,
				},
			);
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('uses shared runtime imports for router-managed production page browser graph entries', async () => {
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		const createBundleOptions = vi.fn(async () => ({}));
		const processDependencies = vi.fn(async () => []);
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: [],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as any,
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => browserRuntimeImports,
			} as any,
		});

		try {
			await service.createPageBrowserGraphDependencies('/app/src/pages/index.tsx', false, []);

			expect(createBundleOptions).toHaveBeenCalledWith(
				`ecopages-react-${rapidhash('/app/src/pages/index.tsx')}`,
				false,
				[],
				{
					includeRuntime: false,
					splitting: true,
				},
			);
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('uses shared runtime imports and readable non-HMR scripts in hosted development', async () => {
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';
		const createBundleOptions = vi.fn(async () => ({}));
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
			} as any,
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({ ...browserRuntimeImports, router: undefined }),
			} as any,
		});

		try {
			const dependencies = await service.createPageBrowserGraphDependencies(
				'/app/src/pages/index.tsx',
				false,
				[],
			);

			expect(createBundleOptions).toHaveBeenCalledWith(
				`ecopages-react-${rapidhash('/app/src/pages/index.tsx')}`,
				false,
				[],
				{
					includeRuntime: false,
					splitting: false,
				},
			);
			expect(dependencies[0]).toMatchObject({
				bundle: true,
				content: expect.stringContaining('import { hydrateRoot } from "/assets/vendors/react-dom.js";'),
			});
			expect(String((dependencies[0] as { content?: string }).content ?? '')).not.toContain('hmr: {');
			expect(String((dependencies[0] as { content?: string }).content ?? '')).toContain(
				'from "/assets/vendors/layout-compose.js"',
			);
			assertNoBareEcopagesImports(String((dependencies[0] as { content?: string }).content ?? ''));
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('uses the React-owned HMR entrypoint path for hydration assets in development', async () => {
		const pageModuleUrl = devTransformPageUrl('pages/index.js');
		const registerScriptEntrypoint = vi.fn(async () => pageModuleUrl);
		const registerEntrypoint = vi.fn(async () => pageModuleUrl);
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => ({
					isEnabled: () => true,
					registerScriptEntrypoint,
					registerEntrypoint,
				}),
			} as any,
			bundleService: {
				getRuntimeImports: () => ({ ...productionRuntimeImports, router: undefined }),
			} as any,
		});

		const importPath = await service.resolveAssetImportPath('/app/src/pages/index.tsx', 'ecopages-react-index');

		expect(importPath).toBe(pageModuleUrl);
		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/pages/index.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
	});

	it('records the HMR entrypoint as the active page module in development', async () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => ({
					isEnabled: () => true,
					registerEntrypoint: async () => devTransformPageUrl('pages/index.js'),
					registerScriptEntrypoint: async () => '/assets/scripts/index.js',
				}),
			} as any,
			bundleService: {
				createBundleOptions: async () => ({}),
				getRuntimeImports: () => ({ ...browserRuntimeImports, router: undefined }),
			} as any,
		});

		const dependencies = await service.createPageBrowserGraphDependencies('/app/src/pages/index.tsx', false, []);

		expect(dependencies[0]).toMatchObject({
			bundle: false,
			content: expect.stringContaining(`const pageModuleUrl = "${devTransformPageUrl('pages/index.js')}";`),
		});
		assertNoBareEcopagesImports(String((dependencies[0] as { content?: string }).content ?? ''));
	});

	it('uses dev transform for island hydration without a duplicate HMR disk bundle', async () => {
		const registerScriptEntrypoint = vi.fn();
		const registerEntrypoint = vi.fn(async () => '/assets/__eco_dev__/components/counter.js');
		const processDependencies = vi.fn(async () => []);
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => ({
					isEnabled: () => true,
					registerEntrypoint,
					registerScriptEntrypoint,
				}),
				processDependencies,
			} as any,
			bundleService: {
				createBundleOptions: vi.fn(),
				getRuntimeImports: () => ({ ...browserRuntimeImports, router: undefined }),
			} as any,
			hmrPageMetadataCache: {
				markOwnedEntrypoint: vi.fn(),
			} as any,
		});

		await service.buildComponentRenderAssets('/app/src/components/counter.tsx', {
			identity: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/components/counter.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
		expect(processDependencies).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					kind: 'script',
					content: expect.stringContaining('registerIslandHmr'),
				}),
			],
			expect.any(String),
		);
	});

	it('builds two islands in one grouped client build and hydrates from recorded output URLs', async () => {
		const islandA = '/app/src/components/counter.tsx';
		const islandB = '/app/src/components/cart.tsx';
		const processDependencies = vi.fn(
			async (deps: Array<{ groupedBundle?: { entryName: string }; name?: string }>) =>
				deps.map((dep) => ({
					kind: 'script' as const,
					srcUrl: dep.groupedBundle ? `/assets/${dep.groupedBundle.entryName}.js` : `/${dep.name}.js`,
					groupedBundle: dep.groupedBundle,
					attributes:
						'attributes' in dep ? (dep as { attributes?: Record<string, string> }).attributes : undefined,
				})),
		);
		const createBundleOptions = vi.fn(async () => ({}));
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as unknown as ConstructorParameters<typeof HydrationAssetService>[0]['assetProcessingService'],
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({ ...productionRuntimeImports, router: undefined }),
			} as unknown as ConstructorParameters<typeof HydrationAssetService>[0]['bundleService'],
		});

		const { assetsByFile } = await service.buildPageClientRenderAssets({
			islands: [
				{ file: islandA, config: { identity: { id: 'Counter', file: islandA, integration: 'react' } } },
				{ file: islandB, config: { identity: { id: 'Cart', file: islandB, integration: 'react' } } },
			],
		});

		expect(processDependencies).toHaveBeenCalledTimes(2);
		const [clientEntries, clientKey] = processDependencies.mock.calls[0] as unknown as [
			Array<{ groupedBundle?: { id: string; entryName: string }; content?: string }>,
			string,
		];
		expect(clientKey).toBe(APP_BROWSER_CLIENT_BUNDLE_ID);
		expect(clientEntries).toHaveLength(2);
		expect(clientEntries.map((entry) => entry.groupedBundle?.id)).toEqual([
			APP_BROWSER_CLIENT_BUNDLE_ID,
			APP_BROWSER_CLIENT_BUNDLE_ID,
		]);
		expect(clientEntries[0]?.content).toContain(`export * from ${JSON.stringify(islandA)}`);
		expect(clientEntries[1]?.content).toContain(`export * from ${JSON.stringify(islandB)}`);

		const hydrationCall = processDependencies.mock.calls[1]?.[0] as Array<{ content?: string }>;
		expect(hydrationCall?.[0]?.content).toContain(`/assets/ecopages-react-island-${rapidhash(islandA)}.js`);
		expect(hydrationCall?.[1]?.content).toContain(`/assets/ecopages-react-island-${rapidhash(islandB)}.js`);
		expect(assetsByFile.get(islandA)?.length).toBeGreaterThan(0);
		expect(assetsByFile.get(islandB)?.length).toBeGreaterThan(0);
	});

	it('reuses the same grouped island entry name for different component instances', async () => {
		const processDependencies = vi.fn(
			async (deps: Array<{ groupedBundle?: { entryName: string }; name?: string }>) =>
				deps.map((dep) => ({
					kind: 'script' as const,
					srcUrl: dep.groupedBundle ? `/assets/${dep.groupedBundle.entryName}.js` : `/${dep.name}.js`,
					groupedBundle: dep.groupedBundle,
					attributes:
						'attributes' in dep ? (dep as { attributes?: Record<string, string> }).attributes : undefined,
				})),
		);
		const createBundleOptions = vi.fn(async () => ({}));
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as unknown as ConstructorParameters<typeof HydrationAssetService>[0]['assetProcessingService'],
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({ ...productionRuntimeImports, router: undefined }),
			} as unknown as ConstructorParameters<typeof HydrationAssetService>[0]['bundleService'],
		});

		await service.buildComponentRenderAssets('/app/src/components/counter.tsx', {
			identity: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});
		await service.buildComponentRenderAssets('/app/src/components/counter.tsx', {
			identity: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		const islandName = `ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`;
		expect(createBundleOptions).toHaveBeenNthCalledWith(1, islandName, false, []);
		expect(createBundleOptions).toHaveBeenNthCalledWith(2, islandName, false, []);

		const firstIslandEntries = processDependencies.mock.calls[0]?.[0] as Array<{
			groupedBundle?: { entryName: string };
		}>;
		const secondIslandEntries = processDependencies.mock.calls[2]?.[0] as Array<{
			groupedBundle?: { entryName: string };
		}>;
		expect(firstIslandEntries[0]?.groupedBundle?.entryName).toBe(islandName);
		expect(secondIslandEntries[0]?.groupedBundle?.entryName).toBe(islandName);

		const firstHydration = processDependencies.mock.calls[1]?.[0] as Array<{
			content?: string;
			name?: string;
			attributes?: Record<string, string>;
		}>;
		const componentKey = getIslandComponentKey('/app/src/components/counter.tsx', {
			identity: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});
		expect(firstHydration[0]?.content).toContain(`/assets/${islandName}.js`);
		expect(firstHydration[0]?.content).toContain(componentKey);
		expect(firstHydration[0]?.attributes?.['data-eco-script-id']).toBe(firstHydration[0]?.name);
	});
});
