import { describe, expect, it, vi } from 'vitest';
import type {
	AssetProcessingService,
	EcoBuildOnResolveResult,
	EcoBuildPlugin,
	IntegrationRuntimeContext,
} from '@ecopages/core/integration';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';
import { BundleService } from './bundle.ts';

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
} as unknown as IntegrationRuntimeContext['appConfig'];

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

		const options = await service.createBundleOptions('ecopages-react-page', []);
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);
		const runtimeImports = service.getRuntimeImports();

		expect(pluginNames).not.toContain('react-renderer-eco-core-browser-shim');
		expect(pluginNames).toContain('ecopages-client-graph-boundary');
		expect(pluginNames).toContain('react-renderer-runtime-import-rewrite');
		expect(pluginNames).not.toContain('react-runtime-import-alias');
		expect(options.external).toEqual(expect.arrayContaining(Object.values(runtimeImports)));
		expect(options.external).not.toEqual(expect.arrayContaining(['react', 'react-dom', 'react-dom/client']));
	});

	it('gives MDX and TSX entries the same plugins so they share one build group', async () => {
		const mdxLoader = { name: 'react-mdx-loader', setup: () => {} };
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			getMdxLoaderPlugin: () => mdxLoader,
		});

		const mdxPageOptions = await service.createBundleOptions('ecopages-react-mdx-page', [], {}, '/app/page.mdx');
		const tsxPageOptions = await service.createBundleOptions('ecopages-react-tsx-page', [], {}, '/app/page.tsx');
		const pluginNames = (options: Record<string, unknown>) =>
			(options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);

		expect(mdxPageOptions.plugins).toContain(mdxLoader);
		expect(tsxPageOptions.plugins).toContain(mdxLoader);
		expect(pluginNames(mdxPageOptions)).toEqual(pluginNames(tsxPageOptions));
	});

	it('enables minify only for production runtimes', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
		});

		const developmentOptions = await withNodeEnv('development', () =>
			service.createBundleOptions('ecopages-react-page', []),
		);
		const productionOptions = await withNodeEnv('production', () =>
			service.createBundleOptions('ecopages-react-page', []),
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

		const options = await service.createBundleOptions('ecopages-react-page', [], {
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
		const options = await service.createBundleOptions('ecopages-react-page', []);
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

	it('processes page-layout-normalization vendor once for concurrent MDX callers', async () => {
		const assetProcessingIntegration = { name: 'react' };
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			assetProcessingIntegration,
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
			assetProcessingIntegration,
		);

		resolveProcess();
		await Promise.all([first, second]);

		await service.ensurePageLayoutNormalizationVendorProcessed(assetProcessingService);
		expect(processDependencies).toHaveBeenCalledTimes(1);
	});

	it('strips server imports from foreign-JSX files in the React client graph', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-react-foreign-jsx-'));
		const srcDir = join(tempDir, 'src');
		mkdirSync(srcDir);
		const entrypoint = join(srcDir, 'island.tsx');
		writeFileSync(join(srcDir, 'auth.server.ts'), 'export const authMiddleware = "server-secret";');
		writeFileSync(join(srcDir, 'eco.ts'), 'export const eco = { page: (options) => options };');
		writeFileSync(
			join(srcDir, 'widget.kita.tsx'),
			[
				"import { eco } from './eco';",
				"import { authMiddleware } from './auth.server.ts';",
				'export default eco.page({',
				'middleware: [authMiddleware],',
				'render: () => <div>Widget</div>,',
				'});',
			].join('\n'),
		);
		writeFileSync(entrypoint, "import Widget from './widget.kita.tsx';\nexport default Widget;");

		try {
			const service = new BundleService({
				rootDir: tempDir,
				appConfig: {
					...testAppConfig,
					rootDir: tempDir,
					absolutePaths: { projectDir: tempDir },
				} as unknown as IntegrationRuntimeContext['appConfig'],
				hostIntegrationName: 'react',
			});
			const options = await service.createBundleOptions('island', [], { includeRuntime: true }, entrypoint);
			const result = await new RolldownBuildAdapter().build({
				environment: 'browser' as const,
				entrypoints: [entrypoint],
				outdir: join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				plugins: options.plugins as EcoBuildPlugin[],
			});
			assertBuildSucceeded(result, 'Build failed');
			const output = readFileSync(result.outputs[0]!.path, 'utf8');
			expect(output).toContain('Widget');
			expect(output).not.toContain('server-secret');
			expect(output).not.toContain('auth.server');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
