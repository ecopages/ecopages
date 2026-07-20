import { rapidhash } from '@ecopages/core/hash';
import { describe, expect, it, vi } from 'vitest';
import { assertNoBareEcopagesImports } from './assert-no-bare-ecopages-imports.ts';
import { getIslandComponentKey, HydrationAssetService } from './hydration-asset.ts';

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
	it('creates one page-owned route entry asset', () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
			} as any,
			bundleService: {
				getRuntimeImports: () => productionRuntimeImports,
			} as any,
		});

		const dependencies = service.createPageDependencies({
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

	it('groups router-managed page entries under a stable shared bundle id', () => {
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

		const dependencies = service.createPageDependencies({
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
				id: 'ecopages-react-router-pages',
				entryName: 'pages__dashboard___project_',
			},
			attributes: {
				'data-eco-page-bootstrap': 'react-router',
			},
		});
	});

	it('keeps router-managed page bootstraps unbundled in development with vendor helper imports', () => {
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

		const dependencies = service.createPageDependencies({
			pagePath: '/app/src/pages/docs/index.tsx',
			componentName: 'ecopages-react-docs',
			importPath: '/assets/_hmr/pages/docs/index.js',
			pageModuleUrlExpression: '"/assets/_hmr/pages/docs/index.js"',
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
		expect(content).toContain('from "/assets/_hmr/pages/docs/index.js"');
		assertNoBareEcopagesImports(content);
	});

	it('emits vendor URLs for MDX layout normalization in unbundled HMR bootstraps', () => {
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

		const dependencies = service.createPageDependencies({
			pagePath: '/app/src/pages/react-content.mdx',
			componentName: 'ecopages-react-mdx',
			importPath: '/assets/_hmr/pages/react-content.js',
			pageModuleUrlExpression: '"/assets/_hmr/pages/react-content.js"',
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
		expect(content).toContain('from "/assets/_hmr/pages/react-content.js"');
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
			expect(String((dependencies[0] as { content?: string }).content ?? '')).not.toContain('hmrHandlers');
			expect(String((dependencies[0] as { content?: string }).content ?? '')).toContain(
				'from "/assets/vendors/layout-compose.js"',
			);
			assertNoBareEcopagesImports(String((dependencies[0] as { content?: string }).content ?? ''));
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('uses the React-owned HMR entrypoint path for hydration assets in development', async () => {
		const registerScriptEntrypoint = vi.fn(async () => '/assets/_hmr/pages/index.js');
		const registerEntrypoint = vi.fn(async () => '/assets/_hmr/pages/index.js');
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

		expect(importPath).toBe('/assets/_hmr/pages/index.js');
		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/pages/index.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
	});

	it('records the HMR entrypoint as the active page module in development', async () => {
		const service = new HydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => ({
					isEnabled: () => true,
					registerEntrypoint: async () => '/assets/_hmr/pages/index.js',
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
			content: expect.stringContaining('const pageModuleUrl = "/assets/_hmr/pages/index.js";'),
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
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/components/counter.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
		expect(processDependencies).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					kind: 'script',
					content: expect.stringContaining('hmrHandlers["/assets/__eco_dev__/components/counter.js"]'),
				}),
			],
			expect.any(String),
		);
	});

	it('reuses the same bundled island asset for different component instances', async () => {
		const processDependencies = vi.fn(async () => []);
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
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});
		await service.buildComponentRenderAssets('/app/src/components/counter.tsx', {
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		expect(createBundleOptions).toHaveBeenNthCalledWith(
			1,
			`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`,
			false,
			[],
		);
		expect(createBundleOptions).toHaveBeenNthCalledWith(
			2,
			`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`,
			false,
			[],
		);

		const [firstDependencies, firstKey] = processDependencies.mock.calls[0] as unknown as [
			Array<{ name: string; content?: string; attributes?: Record<string, string> }>,
			string,
		];
		const [secondDependencies, secondKey] = processDependencies.mock.calls[1] as unknown as [
			Array<{ name: string; content?: string; attributes?: Record<string, string> }>,
			string,
		];

		const [firstBundle, firstHydration] = firstDependencies;
		const [secondBundle, secondHydration] = secondDependencies;
		const componentKey = getIslandComponentKey('/app/src/components/counter.tsx', {
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		expect(firstKey).toBe(`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`);
		expect(secondKey).toBe(`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`);
		expect(secondBundle.name).toBe(firstBundle.name);
		expect(secondHydration.name).toBe(firstHydration.name);
		expect(firstHydration.attributes?.['data-eco-script-id']).toBe(firstHydration.name);
		expect(secondHydration.attributes?.['data-eco-script-id']).toBe(secondHydration.name);
		expect(firstHydration.content).toContain('ecopages-react-island-');
		expect(firstHydration.content).toContain(`[data-eco-component-key=\\"${componentKey}\\"]`);
		expect(secondHydration.content).toContain(`[data-eco-component-key=\\"${componentKey}\\"]`);
		expect(firstHydration.content).toContain('querySelectorAll');
		expect(firstHydration.content).toContain(firstBundle.name);
		expect(secondHydration.content).toContain(secondBundle.name);
	});
});
