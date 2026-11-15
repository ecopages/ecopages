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
import { attributeComponentIdentity } from '../../../../core/src/plugins/eco-component-meta-plugin.ts';
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

	it('gives every entry the same foreign boundary plugin instance, so a merged build runs it once', async () => {
		const service = new BundleService({ rootDir: '/app', appConfig: testAppConfig, hostIntegrationName: 'react' });
		const boundaryOf = (options: Record<string, unknown>) =>
			(options.plugins as Array<{ name: string }>).find(
				(plugin) => plugin.name === 'ecopages-react-foreign-boundary',
			);

		const first = await service.createBundleOptions('ecopages-react-first', [], '/app/first.tsx');
		const second = await service.createBundleOptions('ecopages-react-second', [], '/app/second.tsx');

		expect(boundaryOf(first)).toBeDefined();
		expect(boundaryOf(second)).toBe(boundaryOf(first));
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
			const entrypoint = writeForeignJsxIsland(
				tempDir,
				[
					"export const label = 'Widget';",
					'export default eco.page({',
					'middleware: [authMiddleware],',
					'render: () => <div>{label}</div>,',
					'});',
				],
				"import Widget, { label } from './widget.kita.tsx';\nexport default [Widget, label];",
			);
			const outputPath = await buildReactIsland(tempDir, entrypoint);
			const output = readFileSync(outputPath, 'utf8');
			expect(output).toContain('Widget');
			expect(output).not.toContain('server-secret');
			expect(output).not.toContain('auth.server');
			expect(output).not.toContain('authMiddleware');
			expect(output).toContain('@ecopages/react/foreign-boundary');
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

		it('compiles a foreign file that is itself a browser entry with its owner runtime', async () => {
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
			try {
				const entrypoints = writeSharedApp(tempDir, "import { Card } from './card.tsx'; console.log(Card);");
				const widget = path.join(tempDir, 'widget.script.tsx');
				writeFileSync(widget, 'export const Widget = () => <section>widget</section>;');
				const output = readEntry(
					await buildSharedEntries(tempDir, { ...entrypoints, widget }),
					'widget',
					tempDir,
				);
				expect(output).toContain('@ecopages/jsx/jsx-runtime');
				expect(output).not.toMatch(/react/);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('compiles a foreign script a grouped script entry imports by absolute path with its owner runtime', async () => {
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
			try {
				const entrypoints = writeSharedApp(tempDir, "import { Card } from './card.tsx'; console.log(Card);");
				const widget = path.join(tempDir, 'widget.script.tsx');
				writeFileSync(widget, 'export const Widget = () => <section>widget</section>;\nconsole.log(Widget);');
				mkdirSync(path.join(tempDir, 'content-script-entries'));
				const grouped = path.join(tempDir, 'content-script-entries', 'grouped.js');
				writeFileSync(
					grouped,
					`import ${JSON.stringify(widget)};\nimport ${JSON.stringify(entrypoints.radiant)};`,
				);
				const output = readEntry(
					await buildSharedEntries(tempDir, { island: entrypoints.island, grouped }),
					'grouped',
					tempDir,
				);
				expect(output).toContain('@ecopages/jsx/jsx-runtime');
				expect(output).not.toMatch(/react/);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('fails the build when a React island and a grouped script entry reach one foreign file', async () => {
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
			try {
				const entrypoints = writeSharedApp(tempDir, "import { Card } from './card.tsx'; console.log(Card);");
				const widget = path.join(tempDir, 'widget.script.tsx');
				writeFileSync(widget, "import { Card } from './card.tsx';\nconsole.log(Card);");
				mkdirSync(path.join(tempDir, 'content-script-entries'));
				const grouped = path.join(tempDir, 'content-script-entries', 'grouped.js');
				writeFileSync(
					grouped,
					`import ${JSON.stringify(widget)};\nimport ${JSON.stringify(entrypoints.radiant)};`,
				);
				const result = await buildSharedEntries(tempDir, { island: entrypoints.island, grouped });
				assertBuildFailed(result);
				const message = result.logs.map((log) => log.message).join('\n');
				expect(message).toContain(path.join(tempDir, 'card.tsx'));
				expect(message).toContain(`another browser entry (${grouped})`);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('fails the build when a React island imports a foreign file that is itself a browser entry', async () => {
			const tempDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))));
			try {
				const entrypoints = writeSharedApp(
					tempDir,
					"import { Widget } from './widget.script.tsx'; console.log(Widget);",
				);
				const widget = path.join(tempDir, 'widget.script.tsx');
				writeFileSync(widget, 'export const Widget = () => <section>widget</section>;');
				const result = await buildSharedEntries(tempDir, { ...entrypoints, widget });
				assertBuildFailed(result);
				const message = result.logs.map((log) => log.message).join('\n');
				expect(message).toContain(widget);
				expect(message).toContain('is itself a browser entry');
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		describe('foreign Eco Components a React island renders', () => {
			const writeComponentApp = (tempDir: string, cardSource: string) => {
				writeFileSync(path.join(tempDir, 'eco.ts'), 'export const eco = { component: (config) => config };');
				writeFileSync(
					path.join(tempDir, 'my-el.tsx'),
					"export class MyEl extends HTMLElement { connectedCallback() { console.log('MY_EL_CONTROLLER'); } }\ncustomElements.define('my-el', MyEl);\nexport const Icon = () => <svg />;",
				);
				writeFileSync(path.join(tempDir, 'card.tsx'), cardSource);
				const island = path.join(tempDir, 'island.react.tsx');
				writeFileSync(
					island,
					"import { Card } from './card.tsx';\nexport default function Island() { return <div><Card /></div>; }",
				);
				return island;
			};
			const componentCard = [
				"import { eco } from './eco.ts';",
				"import { MyEl } from './my-el.tsx';",
				"export const Card = eco.component({ dependencies: { scripts: ['./my-el.tsx'] }, render: () => <MyEl /> });",
			].join('\n');

			it('names the Component by identity and ships neither its module nor what it imports', async () => {
				const tempDir = path.fromNative(
					realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))),
				);
				try {
					const island = writeComponentApp(tempDir, componentCard);
					const output = readEntry(await buildSharedEntries(tempDir, { island }), 'island', tempDir);
					const serverId = /bindComponentIdentity\(\{ id: "([a-z0-9]+)"/.exec(
						attributeComponentIdentity(componentCard, path.join(tempDir, 'card.tsx'), {
							integration: 'ecopages-jsx',
							projectRoot: tempDir,
						}).code,
					)?.[1];
					expect(serverId).toBeDefined();
					expect(output).toMatch(
						new RegExp(
							`foreignBoundaryReference\\(\\{\\s*"id": "${serverId}",\\s*"file": "card\\.tsx",\\s*"integration": "ecopages-jsx"`,
						),
					);
					expect(output).not.toContain('MY_EL_CONTROLLER');
					expect(output).not.toContain('my-el');
				} finally {
					rmSync(tempDir, { recursive: true, force: true });
				}
			});

			it('keeps the Component module out when the island imports it through a mixed barrel', async () => {
				const tempDir = path.fromNative(
					realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))),
				);
				try {
					const island = writeComponentApp(tempDir, componentCard);
					writeFileSync(
						path.join(tempDir, 'button.react.tsx'),
						'export const Button = () => <button>react-button</button>;',
					);
					writeFileSync(
						path.join(tempDir, 'components.ts'),
						"export { Card } from './card.tsx';\nexport * from './button.react.tsx';",
					);
					writeFileSync(
						island,
						"import { Card, Button } from './components.ts';\nexport default function Island() { return <div><Card /><Button /></div>; }",
					);
					const output = readEntry(await buildSharedEntries(tempDir, { island }), 'island', tempDir);
					expect(output).toContain('react-button');
					expect(output).toContain('foreignBoundaryReference');
					expect(output).not.toContain('MY_EL_CONTROLLER');
				} finally {
					rmSync(tempDir, { recursive: true, force: true });
				}
			});

			it('gives a barrel that an island and a grouped script share a React form without the Component module', async () => {
				const tempDir = path.fromNative(
					realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))),
				);
				try {
					const entrypoints = writeSharedApp(tempDir, '');
					const island = writeComponentApp(tempDir, componentCard);
					writeFileSync(path.join(tempDir, 'components.ts'), "export { Card } from './card.tsx';");
					writeFileSync(
						island,
						"import { Card } from './components.ts';\nexport default function Island() { return <div><Card /></div>; }",
					);
					mkdirSync(path.join(tempDir, 'content-script-entries'));
					const grouped = path.join(tempDir, 'content-script-entries', 'grouped.js');
					writeFileSync(
						grouped,
						`import { Card } from ${JSON.stringify(path.join(tempDir, 'components.ts'))};\nconsole.log(Card);\nimport ${JSON.stringify(entrypoints.radiant)};`,
					);
					const result = await buildSharedEntries(tempDir, { island, grouped });
					assertBuildSucceeded(result, 'Build failed');
					expect(readEntry(result, 'island', tempDir)).not.toContain('MY_EL_CONTROLLER');
					expect(result.dependencyGraph.entrypoints[island]).not.toContain(path.join(tempDir, 'my-el.tsx'));
					expect(result.dependencyGraph.entrypoints[grouped]).toContain(path.join(tempDir, 'my-el.tsx'));
					const all = result.outputs
						.filter((item) => item.path.endsWith('.js'))
						.map((item) => readFileSync(item.path, 'utf8'))
						.join('\n');
					expect(all).toContain('MY_EL_CONTROLLER');
					expect(all).not.toMatch(/@jsxImportSource react \*\/\s*var MyEl/);
				} finally {
					rmSync(tempDir, { recursive: true, force: true });
				}
			});

			it('keeps the import of a foreign export that is not statically a Component', async () => {
				const tempDir = path.fromNative(
					realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))),
				);
				try {
					const island = writeComponentApp(
						tempDir,
						"import { eco } from './eco.ts';\nconst make = () => eco.component({ render: () => <article>made</article> });\nexport const Card = make();",
					);
					const output = readEntry(await buildSharedEntries(tempDir, { island }), 'island', tempDir);
					expect(output).not.toContain('foreignBoundaryReference(');
					expect(output).toContain('made');
				} finally {
					rmSync(tempDir, { recursive: true, force: true });
				}
			});

			it('lets a grouped script entry own a controller that a Component in a React island imports', async () => {
				const tempDir = path.fromNative(
					realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-react-shared-jsx-'))),
				);
				try {
					const entrypoints = writeSharedApp(tempDir, '');
					const island = writeComponentApp(tempDir, componentCard);
					mkdirSync(path.join(tempDir, 'content-script-entries'));
					const grouped = path.join(tempDir, 'content-script-entries', 'grouped.js');
					writeFileSync(
						grouped,
						`import ${JSON.stringify(path.join(tempDir, 'my-el.tsx'))};\nimport ${JSON.stringify(entrypoints.radiant)};`,
					);
					const result = await buildSharedEntries(tempDir, { island, grouped });
					const output = readEntry(result, 'grouped', tempDir);
					expect(output).toContain('MY_EL_CONTROLLER');
					expect(output).toContain('@ecopages/jsx/jsx-runtime');
					expect(output).not.toMatch(/react/);
				} finally {
					rmSync(tempDir, { recursive: true, force: true });
				}
			});
		});
	});
});
