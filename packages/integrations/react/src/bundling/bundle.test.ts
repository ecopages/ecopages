import { describe, expect, it, vi } from 'vitest';
import type { EcoBuildPlugin, IntegrationRuntimeContext } from '@ecopages/core/integration';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
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
	it('marks neither React nor the router external, so the bundler resolves them like any package', async () => {
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			routerAdapter: {
				name: 'eco-router',
				importPath: '@ecopages/react-router/browser',
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', []);
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);

		expect(pluginNames).toContain('ecopages-client-graph-boundary');
		expect(options.external).toBeUndefined();
	});

	it('gives MDX and TSX entries the same plugins so they share one build group', async () => {
		const mdxLoader = { name: 'react-mdx-loader', setup: () => {} };
		const service = new BundleService({
			rootDir: '/app',
			appConfig: testAppConfig,
			hostIntegrationName: 'react',
			getMdxLoaderPlugin: () => mdxLoader,
		});

		const mdxPageOptions = await service.createBundleOptions('ecopages-react-mdx-page', [], '/app/page.mdx');
		const tsxPageOptions = await service.createBundleOptions('ecopages-react-tsx-page', [], '/app/page.tsx');
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
		const options = await service.createBundleOptions('island', [], entrypoint);
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser' as const,
			entrypoints: [entrypoint],
			outdir: path.join(tempDir, 'dist'),
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
		const srcDir = path.join(tempDir, 'src');
		mkdirSync(srcDir);
		symlinkSync(
			path.fromFileUrl(new URL('../../node_modules', import.meta.url)),
			path.join(tempDir, 'node_modules'),
			'dir',
		);
		const entrypoint = path.join(srcDir, 'island.tsx');
		writeFileSync(path.join(srcDir, 'auth.server.ts'), 'export const authMiddleware = "server-secret";');
		writeFileSync(path.join(srcDir, 'eco.ts'), 'export const eco = { page: (options) => options };');
		writeFileSync(
			path.join(srcDir, 'widget.kita.tsx'),
			["import { eco } from './eco';", "import { authMiddleware } from './auth.server.ts';", ...widgetBody].join(
				'\n',
			),
		);
		writeFileSync(entrypoint, islandSource);
		return entrypoint;
	};

	it('strips server imports from foreign-JSX files in the React client graph', async () => {
		const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-foreign-jsx-'))));

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
			await expect(import(path.toFileUrl(outputPath).href)).resolves.toHaveProperty('default');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails the build when an island uses an export that needs a stripped server binding', async () => {
		const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-foreign-jsx-'))));

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
				`'authMiddleware' (imported from './auth.server.ts') is used at ${path.join(tempDir, 'src', 'widget.kita.tsx')}:3:22`,
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
			const options = await service.createBundleOptions('island', [], entrypoints.island);
			return new RolldownBuildAdapter().build({
				environment: 'browser' as const,
				entrypoints,
				outdir: path.join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				splitting: true,
				external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@ecopages/jsx/jsx-runtime'],
				plugins: [...(options.plugins as EcoBuildPlugin[]), ...getJsxOwnershipPlugins(appConfig)],
			});
		};

		const writeSharedApp = (tempDir: string, islandImport: string) => {
			writeFileSync(path.join(tempDir, 'button.tsx'), 'export const Button = () => <button>button</button>;');
			writeFileSync(path.join(tempDir, 'card.tsx'), 'export const Card = () => <article>card</article>;');
			writeFileSync(
				path.join(tempDir, 'foo.script.ts'),
				"import { Button } from './button.tsx';\ncustomElements.define('x-button', class extends HTMLElement { render = Button; });",
			);
			const island = path.join(tempDir, 'island.react.tsx');
			writeFileSync(island, `${islandImport}\nexport default () => null;`);
			return { island, radiant: path.join(tempDir, 'foo.script.ts') };
		};

		const readEntry = (result: Awaited<ReturnType<typeof buildSharedEntries>>, name: string, tempDir: string) => {
			assertBuildSucceeded(result, 'Build failed');
			return readFileSync(getBuildEntryOutput(result, name, tempDir)!, 'utf8');
		};

		it('compiles a foreign file only another Integration imports with its owner runtime', async () => {
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
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
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
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
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
			try {
				const entrypoints = writeSharedApp(
					tempDir,
					"import { Button } from './button.tsx'; console.log(Button);",
				);
				const result = await buildSharedEntries(tempDir, entrypoints);
				assertBuildFailed(result);
				const message = result.logs.map((log) => log.message).join('\n');
				expect(message).toContain(path.join(tempDir, 'button.tsx'));
				expect(message).toContain('ecopages-jsx file');
				expect(message).toContain('react browser entries');
				expect(message).toContain(path.join(tempDir, 'foo.script.ts'));
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});
