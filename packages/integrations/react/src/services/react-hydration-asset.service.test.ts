import { rapidhash } from '@ecopages/core/hash';
import { describe, expect, it, vi } from 'vitest';
import { getReactIslandComponentKey, ReactHydrationAssetService } from './react-hydration-asset.service.ts';

describe('ReactHydrationAssetService', () => {
	it('creates one page-owned route entry asset', () => {
		const service = new ReactHydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
			} as any,
			bundleService: {
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as any,
		});

		const dependencies = service.createPageDependencies(
			'/app/src/pages/index.tsx',
			'ecopages-react-index',
			'/assets/pages/index.js',
			'import.meta.url',
			{},
			false,
			false,
			false,
		);

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
		const service = new ReactHydrationAssetService({
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
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: '/assets/vendors/react-router-esm.js',
				}),
			} as any,
		});

		const dependencies = service.createPageDependencies(
			'/app/src/pages/dashboard/[project].tsx',
			'ecopages-react-dashboard',
			'/assets/pages/dashboard.js',
			'import.meta.url',
			{},
			false,
			true,
			false,
		);

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

	it('bundles the React runtime into production page browser graph entries', async () => {
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		const createBundleOptions = vi.fn(async () => ({}));
		const processDependencies = vi.fn(async () => []);
		const service = new ReactHydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as any,
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as any,
		});

		try {
			await service.buildPageBrowserGraphAssets('/app/src/pages/index.tsx', false, []);

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
		const service = new ReactHydrationAssetService({
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
				getRuntimeImports: () => ({
					react: '/assets/vendors/react.js',
					reactDomClient: '/assets/vendors/react-dom.js',
					router: '/assets/vendors/react-router-esm.js',
				}),
			} as any,
		});

		try {
			await service.buildPageBrowserGraphAssets('/app/src/pages/index.tsx', false, []);

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

	it('uses the React-owned HMR entrypoint path for hydration assets in development', async () => {
		const registerScriptEntrypoint = vi.fn(async () => '/assets/_hmr/pages/index.js');
		const registerEntrypoint = vi.fn(async () => '/assets/_hmr/pages/index.js');
		const service = new ReactHydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => ({
					isEnabled: () => true,
					registerScriptEntrypoint,
					registerEntrypoint,
				}),
			} as any,
			bundleService: {
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as any,
		});

		const importPath = await service.resolveAssetImportPath('/app/src/pages/index.tsx', 'ecopages-react-index');

		expect(importPath).toBe('/assets/_hmr/pages/index.js');
		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/pages/index.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
	});

	it('records the HMR entrypoint as the active page module in development', async () => {
		const service = new ReactHydrationAssetService({
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
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as any,
		});

		const dependencies = await service.createPageBrowserGraphDependencies('/app/src/pages/index.tsx', false, []);

		expect(dependencies[0]).toMatchObject({
			content: expect.stringContaining('const pageModuleUrl = "/assets/_hmr/pages/index.js";'),
		});
	});

	it('reuses the same bundled island asset for different component instances', async () => {
		const processDependencies = vi.fn(async () => []);
		const createBundleOptions = vi.fn(async () => ({}));
		const service = new ReactHydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as unknown as ConstructorParameters<typeof ReactHydrationAssetService>[0]['assetProcessingService'],
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as unknown as ConstructorParameters<typeof ReactHydrationAssetService>[0]['bundleService'],
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
		const componentKey = getReactIslandComponentKey('/app/src/components/counter.tsx', {
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
