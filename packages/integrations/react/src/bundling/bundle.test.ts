import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import type { EcoBuildOnResolveResult, EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { BundleService } from './bundle.ts';
import { resolveReactPluginRuntimeModules } from './runtime-modules.ts';

const withNodeEnv = async <T>(nodeEnv: string | undefined, run: () => Promise<T>): Promise<T> => {
	if (nodeEnv === undefined) {
		vi.stubEnv('NODE_ENV', undefined);
	} else {
		vi.stubEnv('NODE_ENV', nodeEnv);
	}
	return await run();
};

const testAppConfig = {
	rootDir: '/app',
	absolutePaths: {
		projectDir: '/app',
	},
	integrations: [
		{
			name: 'react',
			jsxImportSource: 'react',
			extensions: ['.react.tsx', '.tsx'],
		},
		{
			name: 'kitajs',
			jsxImportSource: '@kitajs/html',
			extensions: ['.kita.tsx'],
		},
	],
} as unknown as EcoPagesAppConfig;

describe('BundleService', () => {
	it('does not include the Eco core browser shim in client bundle options', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', false, []);
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);
		const runtimeImports = service.getRuntimeImports();

		expect(pluginNames).not.toContain('react-renderer-eco-core-browser-shim');
		expect(pluginNames).toContain('ecopages-client-graph-boundary');
		expect(pluginNames).toContain('react-renderer-runtime-import-rewrite');
		expect(pluginNames).not.toContain('react-runtime-import-alias');
		expect(options.external).toEqual(expect.arrayContaining(Object.values(runtimeImports)));
		expect(options.external).not.toEqual(expect.arrayContaining(['react', 'react-dom', 'react-dom/client']));
	});

	it('adds the plugin-owned MDX loader to MDX bundles only', async () => {
		const mdxLoader = { name: 'react-mdx-loader', setup: () => {} };
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			getMdxLoaderPlugin: () => mdxLoader,
		});

		const mdxOptions = await service.createBundleOptions('ecopages-react-page', true, []);
		const tsxOptions = await service.createBundleOptions('ecopages-react-page', false, []);

		expect(mdxOptions.plugins).toContain(mdxLoader);
		expect(tsxOptions.plugins).not.toContain(mdxLoader);
	});

	it('enables minify only for production runtimes', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
		});

		const developmentOptions = await withNodeEnv('development', () =>
			service.createBundleOptions('ecopages-react-page', false, []),
		);
		const productionOptions = await withNodeEnv('production', () =>
			service.createBundleOptions('ecopages-react-page', false, []),
		);

		expect(developmentOptions.minify).toBeUndefined();
		expect(productionOptions).toMatchObject({
			minify: true,
			treeshaking: true,
		});
	});

	it('can bundle runtime specifiers directly into page-owned entries', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', false, [], {
			includeRuntime: true,
		});
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);

		expect(options.external).toBeUndefined();
		expect(pluginNames).not.toContain('react-renderer-runtime-import-rewrite');
		expect(pluginNames).not.toContain('react-runtime-import-alias');
	});

	async function resolveRuntimeSpecifiers(
		service: BundleService,
		specifiers: string[],
	): Promise<Record<string, EcoBuildOnResolveResult | undefined>> {
		const options = await service.createBundleOptions('ecopages-react-page', false, []);
		const runtimeRewritePlugin = (options.plugins as EcoBuildPlugin[]).find(
			(plugin) => plugin.name === 'react-renderer-runtime-import-rewrite',
		);
		expect(runtimeRewritePlugin).toBeDefined();
		const resolveCallbacks: Array<(args: { path: string }) => EcoBuildOnResolveResult | undefined> = [];
		await runtimeRewritePlugin!.setup({
			onResolve(_options, callback) {
				resolveCallbacks.push(callback as (args: { path: string }) => EcoBuildOnResolveResult | undefined);
			},
			onLoad() {},
			module() {},
			transform() {},
		});

		return Object.fromEntries(
			specifiers.map((specifier) => [
				specifier,
				resolveCallbacks.map((cb) => cb({ path: specifier })).find(Boolean),
			]),
		);
	}

	it('resolves React runtime imports to concrete runtime asset URLs', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
		});

		const resolved = await resolveRuntimeSpecifiers(service, [
			'react',
			'react/jsx-runtime',
			'react/jsx-dev-runtime',
			'react-dom/client',
			'react-dom',
		]);

		expect(resolved['react']).toEqual({ path: '/assets/vendors/react.js', external: true });
		expect(resolved['react-dom']).toEqual({ path: '/assets/vendors/react-dom.js', external: true });
		for (const specifier of ['react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client']) {
			expect(resolved[specifier]?.external, specifier).toBe(true);
			expect(resolved[specifier]?.path, specifier).toMatch(/^\/assets\/vendors\/.+\.js$/);
		}
	});

	it('resolves configured runtime module imports to shared vendor URLs', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			runtimeModules: resolveReactPluginRuntimeModules(['@tanstack/react-query']),
		});

		const resolved = await resolveRuntimeSpecifiers(service, ['@tanstack/react-query']);

		expect(resolved['@tanstack/react-query']).toEqual({
			path: '/assets/vendors/tanstack-react-query.js',
			external: true,
		});
	});

	it('processes page-layout-normalization vendor once for concurrent MDX callers', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
		});
		let resolveProcess!: () => void;
		const processGate = new Promise<void>((resolve) => {
			resolveProcess = resolve;
		});
		const processDependencies = vi.fn(async () => {
			await processGate;
			return [];
		});
		const assetProcessingService = {
			processDependencies,
		} satisfies Pick<AssetProcessingService, 'processDependencies'>;

		const first = service.ensurePageLayoutNormalizationVendorProcessed(assetProcessingService);
		const second = service.ensurePageLayoutNormalizationVendorProcessed(assetProcessingService);

		expect(processDependencies).toHaveBeenCalledTimes(1);
		expect(processDependencies).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'page-layout-normalization',
				}),
			]),
			'react:page-layout-normalization',
		);

		resolveProcess();
		await Promise.all([first, second]);

		await service.ensurePageLayoutNormalizationVendorProcessed(assetProcessingService);
		expect(processDependencies).toHaveBeenCalledTimes(1);
	});
});
