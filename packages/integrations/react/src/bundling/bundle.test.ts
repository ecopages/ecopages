import { describe, expect, it, vi } from 'vitest';
import type { EcoBuildOnResolveResult, EcoBuildPlugin, IntegrationRuntimeContext } from '@ecopages/core/integration';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';
import { getBuildEntryOutput } from '../../../../core/src/build/build-graph.ts';
import { assertBuildFailed } from '../../../../core/src/__fixtures__/build/build-result.ts';
import { getJsxOwnershipPlugins } from '../../../../core/src/build/browser/jsx-ownership-plugins.ts';
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
			onEnd() {},
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

	it('declares the page-layout-normalization vendor as a browser runtime asset left out of the HTML', () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			assetProcessingIntegration: { name: 'react' },
			hostIntegrationName: 'react',
		});

		expect(service.getPageLayoutNormalizationDependencies()).toEqual([
			expect.objectContaining({
				name: 'page-layout-normalization',
				packageRole: 'runtime',
				excludeFromHtml: true,
			}),
		]);
	});

	const buildReactIsland = async (tempDir: string, entrypoint: string) => {
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
		return result.outputs[0]!.path;
	};

	const writeForeignJsxIsland = (
		tempDir: string,
		widgetBody: string[],
		islandSource = "import Widget from './widget.kita.tsx';\nexport default Widget;",
	) => {
		const srcDir = join(tempDir, 'src');
		mkdirSync(srcDir);
		symlinkSync(
			fileURLToPath(new URL('../../node_modules', import.meta.url)),
			join(tempDir, 'node_modules'),
			'dir',
		);
		const entrypoint = join(srcDir, 'island.tsx');
		writeFileSync(join(srcDir, 'auth.server.ts'), 'export const authMiddleware = "server-secret";');
		writeFileSync(join(srcDir, 'eco.ts'), 'export const eco = { page: (options) => options };');
		writeFileSync(
			join(srcDir, 'widget.kita.tsx'),
			["import { eco } from './eco';", "import { authMiddleware } from './auth.server.ts';", ...widgetBody].join(
				'\n',
			),
		);
		writeFileSync(entrypoint, islandSource);
		return entrypoint;
	};

	it('strips server imports from foreign-JSX files in the React client graph', async () => {
		const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-react-foreign-jsx-')));

		try {
			const entrypoint = writeForeignJsxIsland(tempDir, [
				'export default eco.page({',
				'middleware: [authMiddleware],',
				'render: () => <div>Widget</div>,',
				'});',
			]);
			const outputPath = await buildReactIsland(tempDir, entrypoint);
			const output = readFileSync(outputPath, 'utf8');
			expect(output).toContain('Widget');
			expect(output).not.toContain('server-secret');
			expect(output).not.toContain('auth.server');
			expect(output).not.toContain('authMiddleware');
			await expect(import(pathToFileURL(outputPath).href)).resolves.toHaveProperty('default');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails the build when an island uses an export that needs a stripped server binding', async () => {
		const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-react-foreign-jsx-')));

		try {
			const entrypoint = writeForeignJsxIsland(
				tempDir,
				[
					'export const guard = authMiddleware;',
					'export default eco.page({ render: () => <div>Widget</div> });',
				],
				"import Widget, { guard } from './widget.kita.tsx';\nexport default [Widget, guard];",
			);
			await expect(buildReactIsland(tempDir, entrypoint)).rejects.toThrow(
				`'authMiddleware' (imported from './auth.server.ts') is used at ${join(tempDir, 'src', 'widget.kita.tsx')}:3:22`,
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('foreign-JSX files in a build shared with another JSX Integration', () => {
		/** An app where `@ecopages/jsx` owns `.tsx` and React owns `.react.tsx`. */
		const buildSharedEntries = async (tempDir: string, entrypoints: Record<string, string>) => {
			const appConfig = {
				rootDir: tempDir,
				absolutePaths: { projectDir: tempDir },
				integrations: [
					{ name: 'react', jsxImportSource: 'react', extensions: ['.react.tsx'] },
					{ name: 'ecopages-jsx', jsxImportSource: '@ecopages/jsx', extensions: ['.tsx'] },
				],
			} as unknown as IntegrationRuntimeContext['appConfig'];
			const service = new BundleService({ rootDir: tempDir, appConfig, hostIntegrationName: 'react' });
			const options = await service.createBundleOptions('island', [], {}, entrypoints.island);
			return new RolldownBuildAdapter().build({
				environment: 'browser' as const,
				entrypoints,
				outdir: join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				splitting: true,
				external: [...(options.external as string[]), '@ecopages/jsx/jsx-runtime'],
				plugins: [...(options.plugins as EcoBuildPlugin[]), ...getJsxOwnershipPlugins(appConfig)],
			});
		};

		const writeSharedApp = (tempDir: string, islandImport: string) => {
			writeFileSync(join(tempDir, 'button.tsx'), 'export const Button = () => <button>button</button>;');
			writeFileSync(join(tempDir, 'card.tsx'), 'export const Card = () => <article>card</article>;');
			writeFileSync(
				join(tempDir, 'foo.script.ts'),
				"import { Button } from './button.tsx';\ncustomElements.define('x-button', class extends HTMLElement { render = Button; });",
			);
			const island = join(tempDir, 'island.react.tsx');
			writeFileSync(island, `${islandImport}\nexport default () => null;`);
			return { island, radiant: join(tempDir, 'foo.script.ts') };
		};

		const readEntry = (result: Awaited<ReturnType<typeof buildSharedEntries>>, name: string, tempDir: string) => {
			assertBuildSucceeded(result, 'Build failed');
			return readFileSync(getBuildEntryOutput(result, name, tempDir)!, 'utf8');
		};

		it('compiles a foreign file only another Integration imports with its owner runtime', async () => {
			const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-react-shared-jsx-')));
			try {
				const entrypoints = writeSharedApp(tempDir, "import { Card } from './card.tsx'; console.log(Card);");
				const radiant = readEntry(await buildSharedEntries(tempDir, entrypoints), 'radiant', tempDir);
				expect(radiant).toContain('@ecopages/jsx/jsx-runtime');
				expect(radiant).not.toMatch(/react/);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('compiles a foreign file a React island imports with the React runtime', async () => {
			const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-react-shared-jsx-')));
			try {
				const entrypoints = writeSharedApp(tempDir, "import { Card } from './card.tsx'; console.log(Card);");
				const island = readEntry(await buildSharedEntries(tempDir, entrypoints), 'island', tempDir);
				expect(island).toContain('card');
				expect(island).toMatch(/react/);
				expect(island).not.toContain('@ecopages/jsx/jsx-runtime');
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('fails the build when a React island and another Integration import one foreign file', async () => {
			const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-react-shared-jsx-')));
			try {
				const entrypoints = writeSharedApp(
					tempDir,
					"import { Button } from './button.tsx'; console.log(Button);",
				);
				const result = await buildSharedEntries(tempDir, entrypoints);
				assertBuildFailed(result);
				const message = result.logs.map((log) => log.message).join('\n');
				expect(message).toContain(join(tempDir, 'button.tsx'));
				expect(message).toContain('ecopages-jsx file');
				expect(message).toContain('react browser entries');
				expect(message).toContain(join(tempDir, 'foo.script.ts'));
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});
