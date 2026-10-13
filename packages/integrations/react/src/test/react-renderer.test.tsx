import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	eco,
	getComponentIdentity,
	type ForeignSubtreeRenderPayload,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type EcoComponentConfig,
	type EcoPageFile,
	type HtmlTemplateProps,
	type PageBrowserGraphResult,
} from '@ecopages/core';
import { toForeignSubtreeRenderPayload } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import { type RouteModuleLoadOptions } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { runWithComponentRenderContext } from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { createDeferredIntegrationPlugin, createTestAppConfig } from '@ecopages/testing';
import { describeRendererContract } from '@ecopages/testing/renderer-contract';
import React, { type JSX } from 'react';
import { ReactRenderer, type ReactRendererConfig } from '../render/react-renderer.ts';
import type { ReactRuntime } from '../render/layout-compose.ts';
import { getIslandComponentKey } from '../hydration/hydration-asset.ts';
import { Page } from './fixture/test-page';

const mockRouterAdapter = {
	name: 'test-router',
	bundle: {
		importPath: '@test/router/browser',
		outputName: 'test-router',
		externals: ['react', 'react-dom'],
	},
	components: {
		router: 'TestRouter',
		pageContent: 'TestPageContent',
	},
	getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
};

const testDir = mkdtempSync(path.join(os.tmpdir(), 'react-renderer-test-'));

const Config = await createTestAppConfig({
	distDir: testDir,
});

const HtmlTemplate: EcoComponent<HtmlTemplateProps, JSX.Element> = ({ headContent, children }) => (
	<html lang="en">
		<head>{headContent}</head>
		<body>{children}</body>
	</html>
);

const NonReactHtmlTemplate = ({ headContent, children }: HtmlTemplateProps) =>
	`<html lang="en"><head>${headContent ?? ''}</head><body>${children}</body></html>`;

NonReactHtmlTemplate.config = {
	integration: 'html',
};

const pageFilePath = path.resolve(__dirname, 'fixture/test-page.tsx');

type TestReactRuntimeModules = {
	react: ReactRuntime;
	reactDomServer: typeof import('react-dom/server');
};

const createAssetProcessingServiceMock = () => ({
	getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
	processDependencies: vi.fn(
		async (
			deps: Array<{
				groupedBundle?: { entryName: string };
				attributes?: Record<string, string>;
				name?: string;
				kind?: string;
			}>,
		) =>
			deps.map((dep) => ({
				kind: dep.kind ?? 'script',
				srcUrl: dep.groupedBundle ? `/assets/${dep.groupedBundle.entryName}.js` : '/assets/mock.js',
				groupedBundle: dep.groupedBundle,
				attributes: dep.attributes,
				filepath: `/dist/${dep.name ?? 'asset'}.js`,
			})),
	),
});

/**
 * Narrows the recording asset service double to the constructor option type in one place.
 */
const asAssetProcessingService = (mock: object) =>
	mock as unknown as ConstructorParameters<typeof ReactRenderer>[0]['assetProcessingService'];

const renderer = new ReactRenderer({
	appConfig: Config,
	assetProcessingService: asAssetProcessingService(createAssetProcessingServiceMock()),
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

type ComposeChildrenRequest = {
	page: { component: EcoComponent; props: Record<string, unknown> };
	shellLayouts: Array<{ component: EcoComponent; props?: Record<string, unknown> }>;
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
};

class TestReactRenderer extends ReactRenderer {
	composeChildrenRequests: ComposeChildrenRequest[] = [];
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
	importedPageFileOverride?: EcoPageFile;
	shouldHydratePageOverride?: boolean;
	isMdxFileOverride?: boolean;
	declaredModulesOverride?: string[];
	pageBrowserGraphOverride?: PageBrowserGraphResult;
	reactRuntimeModulesOverride?: TestReactRuntimeModules;

	constructor(options: ConstructorParameters<typeof ReactRenderer>[0]) {
		super(options);

		const originalShouldHydratePage = this.pageModuleService.shouldHydratePage.bind(this.pageModuleService);
		const originalIsMdxFile = this.pageModuleService.isMdxFile.bind(this.pageModuleService);
		const originalCollectPageDeclaredModules = this.pageModuleService.collectPageDeclaredModules.bind(
			this.pageModuleService,
		);
		const originalProcessDependencies = this.assetProcessingService.processDependencies.bind(
			this.assetProcessingService,
		);

		this.pageModuleService.shouldHydratePage = ((pageModule) =>
			this.shouldHydratePageOverride ??
			originalShouldHydratePage(pageModule)) as typeof this.pageModuleService.shouldHydratePage;
		this.pageModuleService.isMdxFile = ((filePath) =>
			this.isMdxFileOverride ?? originalIsMdxFile(filePath)) as typeof this.pageModuleService.isMdxFile;
		this.pageModuleService.collectPageDeclaredModules = ((pageModule) =>
			this.declaredModulesOverride ??
			originalCollectPageDeclaredModules(pageModule)) as typeof this.pageModuleService.collectPageDeclaredModules;
		this.assetProcessingService.processDependencies = vi.fn(
			async (...args) =>
				(this.pageBrowserGraphOverride ? [...this.pageBrowserGraphOverride.entryAssets] : undefined) ??
				originalProcessDependencies(...(args as Parameters<typeof originalProcessDependencies>)),
		) as typeof this.assetProcessingService.processDependencies;
	}

	protected override async resolvePageBrowserGraphForFile(
		filePath: string,
	): Promise<PageBrowserGraphResult | undefined> {
		return this.pageBrowserGraphOverride ?? super.resolvePageBrowserGraphForFile(filePath);
	}

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps, JSX.Element>> {
		return this.htmlTemplate as EcoComponent<HtmlTemplateProps, JSX.Element>;
	}

	protected override resolveReactRuntimeModules() {
		return this.reactRuntimeModulesOverride ?? super.resolveReactRuntimeModules();
	}

	protected override async importPageFile(file: string, _options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
		if (this.importedPageFileOverride) {
			return this.importedPageFileOverride;
		}

		return await super.importPageFile(file);
	}

	public async testPrepareRenderOptions(filePath: string) {
		return await this.prepareRenderOptions({ file: filePath, params: {}, query: {} });
	}

	public async testCollectPageBrowserGraphContribution(filePath: string, pageModule: EcoPageFile) {
		return await this.collectPageBrowserGraphContribution({ file: filePath, pageModule });
	}

	public getCurrentPagePackageForTest() {
		return this.htmlTransformer.getPagePackage();
	}

	public resolveComposeChildrenForTest(options: ComposeChildrenRequest) {
		return this.resolveComposeChildren(options);
	}

	protected override resolveComposeChildren(options: ComposeChildrenRequest) {
		this.composeChildrenRequests.push(options);
		return super.resolveComposeChildren(options);
	}
}

const createRenderer = (reactConfig?: ReactRendererConfig) => {
	return new TestReactRenderer({
		appConfig: Config,
		assetProcessingService: asAssetProcessingService(createAssetProcessingServiceMock()),
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
		reactConfig,
	});
};

class ImportTestReactRenderer extends ReactRenderer {
	public async importForTest(file: string) {
		return this.importPageFile(file);
	}

	public spyOnPageLoader() {
		return vi.spyOn(this.pageModuleLoaderService, 'importPageFile');
	}
}

const createRendererWithAssets = (reactConfig?: ReactRendererConfig) => {
	const assetProcessingService = createAssetProcessingServiceMock();

	const testRenderer = new TestReactRenderer({
		appConfig: Config,
		assetProcessingService: asAssetProcessingService(assetProcessingService),
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
		reactConfig,
	});
	return { testRenderer, assetProcessingService };
};

const HeadedHtmlTemplate: EcoComponent<HtmlTemplateProps, JSX.Element> = ({ headContent, children, metadata }) => (
	<html lang="en">
		<head>
			<title>{metadata.title}</title>
			{headContent}
		</head>
		<body>{children}</body>
	</html>
);

describeRendererContract({
	name: 'react',
	errorPrefix: 'Failed to render component',
	async createRenderer({ integrations, processDependencies }) {
		const testRenderer = new TestReactRenderer({
			appConfig: await createTestAppConfig({ distDir: testDir, integrations }),
			assetProcessingService: {
				getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
				processDependencies: vi.fn(async (deps: Array<{ groupedBundle?: unknown }>, ...rest: unknown[]) =>
					deps.some((dep) => dep.groupedBundle)
						? createAssetProcessingServiceMock().processDependencies(deps as never)
						: (processDependencies as (...args: unknown[]) => unknown)(deps, ...rest),
				),
			} as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = HeadedHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
		return testRenderer;
	},
	makeComponent({ tag, acceptsChildren, asLayout, config, embed }) {
		const Tag = tag as 'section';
		const identity =
			config?.identity ??
			(asLayout ? { id: 'contract-layout', file: '/app/layouts/contract.tsx', integration: 'react' } : undefined);
		const dependencies = { ...config?.dependencies, ...(embed ? { components: embed } : {}) };
		const renderMarkup = (props: Record<string, unknown>) => (
			<Tag>
				{props.text as string | undefined}
				{acceptsChildren ? (props.children as React.ReactNode) : undefined}
				{(embed ?? []).map((Widget, index) => (
					<React.Fragment key={index}>
						{(Widget as unknown as (props: object) => React.ReactNode)({})}
					</React.Fragment>
				))}
			</Tag>
		);

		return (asLayout
			? eco.layout<JSX.Element>({
					integration: 'react',
					identity,
					dependencies,
					render: (props) => renderMarkup({ ...props }),
				})
			: eco.component<Record<string, unknown>, JSX.Element>({
					integration: 'react',
					identity,
					dependencies,
					render: renderMarkup,
				})) as unknown as EcoComponent;
	},
	makeView({ text, layout, title, fail }) {
		return eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			layout: layout as never,
			metadata: () => ({ title: title ?? 'Contract', description: title ?? 'Contract' }),
			render: () => {
				if (fail) {
					throw new Error(fail);
				}
				return <section>{text}</section>;
			},
		}) as unknown as EcoComponent;
	},
	async renderIsland(renderer, input) {
		const islandRenderer = renderer as unknown as {
			collectIslandRenderAssets: (plan: {
				currentIntegrationName: string;
				islandEntries: Array<{ file: string; integrationName: string; component: EcoComponent }>;
			}) => Promise<Map<string, unknown[]>>;
		};
		const file = input.component.config?.identity?.file ?? '';
		const islandRenderAssetsByFile = await islandRenderer.collectIslandRenderAssets({
			currentIntegrationName: 'kitajs',
			islandEntries: [{ file, integrationName: 'react', component: input.component }],
		});
		const { value } = await runWithComponentRenderContext(
			{ currentIntegration: 'kitajs', islandRenderAssetsByFile: islandRenderAssetsByFile as never },
			async () => renderer.renderComponent(input),
		);
		return value;
	},
});

describe('ReactRenderer', () => {
	describe('renderComponent', () => {
		it.each(['layoutsDir', 'componentsDir'] as const)(
			'resolves a page relative script against the app %s',
			async (dir) => {
				const rootDir = mkdtempSync(path.join(os.tmpdir(), 'react-renderer-app-dirs-'));
				try {
					const config = await createTestAppConfig({ rootDir, distDir: testDir });
					const scriptDir = config.absolutePaths[dir];
					mkdirSync(scriptDir, { recursive: true });
					writeFileSync(path.join(scriptDir, 'shell.script.ts'), '');
					const appRenderer = new ReactRenderer({
						appConfig: config,
						assetProcessingService: asAssetProcessingService(createAssetProcessingServiceMock()),
						runtimeOrigin: 'http://localhost:3000',
						resolvedIntegrationDependencies: [],
					});

					const pageConfig = appRenderer.pageModuleService.ensureConfigFileMetadata(
						{ dependencies: { scripts: ['./shell.script.ts'] } },
						path.join(rootDir, 'elsewhere', 'guide.mdx'),
					);

					expect(getComponentIdentity(pageConfig)?.file).toBe(path.join(scriptDir, 'guide.mdx'));
				} finally {
					rmSync(rootDir, { recursive: true, force: true });
				}
			},
		);

		it('should compose React element children without escaping nested markup', async () => {
			const testRenderer = createRenderer();
			const Wrapper = (({ children }: { children?: React.ReactNode }) => (
				<section>{children}</section>
			)) as unknown as EcoComponent<{
				children?: React.ReactNode;
			}>;
			const Inner = (() => <p>Nested</p>) as unknown as EcoComponent<object>;

			const result = await testRenderer.renderComponent({
				component: Wrapper,
				props: {},
				children: React.createElement(Inner, {}),
			});

			expect(result.html).toContain('<section><p>Nested</p></section>');
		});

		it('should report non-attachable boundaries for fragment output', async () => {
			const testRenderer = createRenderer();
			const Component = (() => (
				<>
					<span>One</span>
					<span>Two</span>
				</>
			)) as unknown as EcoComponent<object>;

			const result = await testRenderer.renderComponent({
				component: Component,
				props: {},
			});

			expect(result.canAttachAttributes).toBe(false);
			expect(result.rootTag).toBe('span');
			expect(result.html).toContain('<span>One</span>');
		});

		it('should emit hydration assets for attachable component roots', async () => {
			const { testRenderer, assetProcessingService } = createRendererWithAssets();
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
			}>;
			Component.config = {
				identity: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const renderer = testRenderer as unknown as {
				collectIslandRenderAssets: (plan: {
					currentIntegrationName: string;
					islandEntries: Array<{ file: string; integrationName: string; component: EcoComponent }>;
				}) => Promise<Map<string, unknown[]>>;
			};
			const islandRenderAssetsByFile = await renderer.collectIslandRenderAssets({
				currentIntegrationName: 'kitajs',
				islandEntries: [{ file: pageFilePath, integrationName: 'react', component: Component }],
			});
			expect(assetProcessingService.processDependencies).toHaveBeenCalled();

			const { value: result } = await runWithComponentRenderContext(
				{ currentIntegration: 'kitajs', islandRenderAssetsByFile: islandRenderAssetsByFile as never },
				async () =>
					testRenderer.renderComponent({
						component: Component,
						props: { title: 'Island' },
						integrationContext: { componentInstanceId: 'island-1' },
					}),
			);

			expect(result.canAttachAttributes).toBe(true);
			expect(result.html).toBe('<eco-island style="display:contents"><h3>Island</h3></eco-island>');
			expect(result.html).not.toContain('<div');
			expect(result.rootAttributes?.['data-eco-island']).toBe('');
			expect(result.rootAttributes?.['data-eco-island-integration']).toBe('react');
			expect(result.rootAttributes?.['data-eco-component-id']).toBe('island-1');
			expect(result.rootAttributes?.['data-eco-component-key']).toBe(
				getIslandComponentKey(pageFilePath, Component.config),
			);
			expect(result.rootAttributes?.['data-eco-props']).toBe(btoa(JSON.stringify({ title: 'Island' })));
		});

		it('does not emit island hydration for the page owner React tree', async () => {
			const { testRenderer, assetProcessingService } = createRendererWithAssets();
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
			}>;
			Component.config = {
				identity: {
					id: 'page',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const renderer = testRenderer as unknown as {
				collectIslandRenderAssets: (plan: {
					currentIntegrationName: string;
					islandEntries: Array<{ file: string; integrationName: string; component: EcoComponent }>;
				}) => Promise<Map<string, unknown[]>>;
			};

			await renderer.collectIslandRenderAssets({
				currentIntegrationName: 'react',
				islandEntries: [{ file: pageFilePath, integrationName: 'react', component: Component }],
			});

			expect(assetProcessingService.processDependencies).not.toHaveBeenCalled();
		});

		it('should not emit island assets when no componentInstanceId is provided', async () => {
			const { testRenderer, assetProcessingService } = createRendererWithAssets({
				routerAdapter: mockRouterAdapter,
			});
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
			}>;
			Component.config = {
				identity: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'Page child' },
			});

			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootAttributes).toBeUndefined();
			expect(result.assets).toBeUndefined();
			expect(assetProcessingService.processDependencies).not.toHaveBeenCalled();
		});

		it('should preserve resolved child html without escaping and skip parent island hydration', async () => {
			const { testRenderer, assetProcessingService } = createRendererWithAssets();
			const Component = (({ title, children }: { title: string; children?: React.ReactNode }) => (
				<section>
					<h3>{title}</h3>
					<div data-slot>{children}</div>
				</section>
			)) as unknown as EcoComponent<{
				title: string;
				children?: React.ReactNode;
			}>;
			Component.config = {
				identity: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'Parent' },
				children: '<span data-child="true">Nested child</span>',
				integrationContext: { componentInstanceId: 'island-1' },
			});

			expect(result.html).toContain('<div data-slot="true"><span data-child="true">Nested child</span></div>');
			expect(result.html).not.toContain('&lt;span');
			expect(result.rootAttributes).toBeUndefined();
			expect(result.assets).toBeUndefined();
			expect(assetProcessingService.processDependencies).not.toHaveBeenCalled();
		});

		it('should omit guarded locals from hydrated component props', async () => {
			const { testRenderer } = createRendererWithAssets();
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
				locals?: unknown;
			}>;
			Component.config = {
				identity: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const guardedLocals = new Proxy(
				{},
				{
					ownKeys: () => {
						throw new Error('guarded locals');
					},
				},
			);

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'Island', locals: guardedLocals },
				integrationContext: { componentInstanceId: 'island-1' },
			});

			expect(result.rootAttributes?.['data-eco-props']).toBe(btoa(JSON.stringify({ title: 'Island' })));
		});

		it('should resolve foreign boundaries inside React and preserve upstream child html', async () => {
			const deferredRenderComponent = vi.fn(
				async (input: ComponentRenderInput): Promise<ComponentRenderResult> => ({
					html: `<aside data-slot="true">${input.children ?? ''}<button data-testid="deferred-widget">Deferred widget</button></aside>`,
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'deferred',
					rootAttributes: {
						'data-eco-component-id':
							(input.integrationContext as { componentInstanceId?: string } | undefined)
								?.componentInstanceId ?? 'missing',
					},
					assets: [
						{
							kind: 'script' as const,
							inline: true,
							content: 'console.log("deferred-react")',
							position: 'body' as const,
						},
					],
				}),
			);

			const deferredPlugin = createDeferredIntegrationPlugin({
				renderComponent: deferredRenderComponent,
			});
			const config = await createTestAppConfig({
				distDir: testDir,
				integrations: [deferredPlugin],
			});

			const testRenderer = new TestReactRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredShell = eco.component<{ children?: React.ReactNode }, string>({
				identity: {
					id: 'deferred-shell',
					file: '/app/components/deferred-shell.deferred.tsx',
					integration: 'deferred',
				},
				integration: 'deferred',
				render: () => '',
			});

			const Shell = eco.component<{ label: string; children?: React.ReactNode }, JSX.Element>({
				integration: 'react',
				dependencies: {
					components: [DeferredShell],
				},
				render: ({ label, children }) => (
					<section>
						<h2>{label}</h2>
						{DeferredShell({ children }) as unknown as React.ReactNode}
					</section>
				),
			});

			const result = await testRenderer.renderComponentWithForeignChildren({
				component: Shell,
				props: { label: 'Host' },
				children: '<span data-child="true">Child</span>',
				integrationContext: { componentInstanceId: 'host' },
			});

			expect(result.html).toContain('<h2>Host</h2>');
			expect(result.html).toContain(
				'<aside data-slot="true" data-eco-component-id="host_n_1"><span data-child="true">Child</span><button data-testid="deferred-widget">Deferred widget</button></aside>',
			);
			expect(result.html).not.toContain('<eco-marker');
			expect(result.assets).toEqual([
				expect.objectContaining({
					kind: 'script',
					inline: true,
					position: 'body',
				}),
			]);
			expect(deferredRenderComponent).toHaveBeenCalledTimes(1);
		});

		it('should expose the compatibility foreign-subtree payload contract for attachable roots', async () => {
			const { testRenderer } = createRendererWithAssets();
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
			}>;
			Component.config = {
				identity: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const result = toForeignSubtreeRenderPayload(
				await testRenderer.renderComponentWithForeignChildren({
					component: Component,
					props: { title: 'Island' },
					integrationContext: { componentInstanceId: 'island-1' },
				}),
			);

			expect(result).toEqual<ForeignSubtreeRenderPayload>({
				html: '<eco-island style="display:contents"><h3>Island</h3></eco-island>',
				assets: [],
				rootTag: 'eco-island',
				rootAttributes: {
					'data-eco-component-id': 'island-1',
					'data-eco-component-key': getIslandComponentKey(pageFilePath, Component.config),
					'data-eco-props': btoa(JSON.stringify({ title: 'Island' })),
					'data-eco-island': '',
					'data-eco-island-integration': 'react',
				},
				attachmentPolicy: { kind: 'first-element' },
				integrationName: 'react',
			});
		});

		it('should expose a none attachment policy for fragment boundaries', async () => {
			const testRenderer = createRenderer();
			const Component = (() => (
				<>
					<span>One</span>
					<span>Two</span>
				</>
			)) as unknown as EcoComponent<object>;

			const result = toForeignSubtreeRenderPayload(
				await testRenderer.renderComponentWithForeignChildren({
					component: Component,
					props: {},
				}),
			);

			expect(result.attachmentPolicy).toEqual({ kind: 'none' });
			expect(result.rootAttributes).toBeUndefined();
			expect(result.integrationName).toBe('react');
			expect(result.html).toContain('<span>One</span>');
			expect(result.html).toContain('<span>Two</span>');
		});
	});

	it('should render boundaries with the app-scoped React runtime', async () => {
		const appReact = { ...React };
		const appReactDomServer = { ...(await import('react-dom/server')) };
		const createElement = vi.spyOn(appReact, 'createElement');
		const renderToString = vi.spyOn(appReactDomServer, 'renderToString');
		const testRenderer = createRenderer();
		testRenderer.reactRuntimeModulesOverride = { react: appReact, reactDomServer: appReactDomServer };

		const ForeignSubtree = eco.component<{ label: string }, JSX.Element>({
			integration: 'react',
			render: ({ label }) => <section>{label}</section>,
		});

		const result = await testRenderer.renderComponentWithForeignChildren({
			component: ForeignSubtree,
			props: { label: 'Hello' },
		});

		expect(result.html).toBe('<section>Hello</section>');
		expect(createElement).toHaveBeenCalledWith(ForeignSubtree, { label: 'Hello' });
		expect(renderToString).toHaveBeenCalledTimes(1);
	});

	afterAll(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it('should render the page', async () => {
		const body = await renderer.render({
			params: {},
			query: {},
			props: {},
			resolvedDependencies: [],
			file: pageFilePath,
			metadata: {
				title: 'Test Page',
				description: 'Test Description',
			},
			dependencies: {
				scripts: [],
				stylesheets: [],
			},
			Page,
			HtmlTemplate,
		});

		const text = await new Response(body as BodyInit).text();
		expect(text).toContain('<div>Hello World</div>');
	});

	it('passes route-resolved dependency roots into the document shell', async () => {
		const testRenderer = createRenderer();
		const resolvedContent = (() => <article>Resolved content</article>) as unknown as EcoComponent;

		await testRenderer.render({
			params: {},
			query: {},
			props: {},
			resolvedDependencies: [],
			resolvedPageDependencyComponents: [resolvedContent],
			file: pageFilePath,
			metadata: { title: 'Test Page', description: 'Test Description' },
			Page,
			HtmlTemplate,
		});

		expect(testRenderer.composeChildrenRequests.map((request) => request.foreignChildRoots)).toEqual([
			[resolvedContent],
		]);
	});

	it('uses sequential shell rendering when a route dependency root is foreign', () => {
		const testRenderer = createRenderer();
		const ReactPage = Object.assign(() => <main />, {
			config: { integration: 'react' },
		}) as unknown as EcoComponent;
		const ReactLayout = Object.assign(() => <section />, {
			config: { integration: 'react' },
		}) as unknown as EcoComponent;
		const ForeignRoot = Object.assign(() => '<article />', {
			config: { integration: 'ecopages-jsx' },
		}) as unknown as EcoComponent;

		const composeChildren = testRenderer.resolveComposeChildrenForTest({
			page: { component: ReactPage, props: {} },
			shellLayouts: [{ component: ReactLayout }],
			foreignChildRoots: [ForeignRoot],
		});

		expect(composeChildren).toBeUndefined();

		const NestedForeignPage = Object.assign(() => <main />, {
			config: {
				integration: 'react',
				dependencies: { components: [ForeignRoot] },
			},
		}) as unknown as EcoComponent;
		const nestedComposeChildren = testRenderer.resolveComposeChildrenForTest({
			page: { component: NestedForeignPage, props: {} },
			shellLayouts: [{ component: ReactLayout }],
		});

		expect(nestedComposeChildren).toBeUndefined();

		const NestedForeignLayout = Object.assign(() => <section />, {
			config: {
				integration: 'react',
				dependencies: { components: [ForeignRoot] },
			},
		}) as unknown as EcoComponent;
		const layoutForeignComposeChildren = testRenderer.resolveComposeChildrenForTest({
			page: { component: ReactPage, props: {} },
			shellLayouts: [{ component: NestedForeignLayout }],
		});

		expect(layoutForeignComposeChildren).toBeUndefined();
	});

	it('should keep emitting route hydration assets in development', async () => {
		const testRenderer = createRenderer();
		const hydrationAssets = [
			{
				kind: 'script',
				filepath: '/virtual/react-hydration.js',
			},
		] as any;

		testRenderer.importedPageFileOverride = {
			default: Page,
			config: {},
		} as EcoPageFile;
		testRenderer.shouldHydratePageOverride = true;
		testRenderer.isMdxFileOverride = false;
		testRenderer.declaredModulesOverride = [];
		testRenderer.pageBrowserGraphOverride = { entryAssets: hydrationAssets, chunkAssets: [] };

		vi.stubEnv('NODE_ENV', 'development');

		await expect(testRenderer.testPrepareRenderOptions(pageFilePath)).resolves.toEqual(
			expect.objectContaining({
				pagePackage: expect.objectContaining({
					assets: expect.arrayContaining(hydrationAssets),
				}),
			}),
		);
	});

	it('skips hydration assets for pages without declared modules unless forceBrowserGraph is set', async () => {
		const withoutForce = createRenderer();
		const withForce = createRenderer({ forceBrowserGraph: true });
		const pageWithoutModules = {
			default: Page,
			config: {},
		} as EcoPageFile;

		const withoutForceSpy = vi.spyOn(withoutForce.hydrationAssetService, 'createPageBrowserGraphDependencies');
		const withForceSpy = vi
			.spyOn(withForce.hydrationAssetService, 'createPageBrowserGraphDependencies')
			.mockResolvedValue([]);

		await expect(
			withoutForce.testCollectPageBrowserGraphContribution(pageFilePath, pageWithoutModules),
		).resolves.toEqual({ assets: [] });
		await expect(
			withForce.testCollectPageBrowserGraphContribution(pageFilePath, pageWithoutModules),
		).resolves.toEqual({ dependencies: [], assets: [] });

		expect(withoutForceSpy).not.toHaveBeenCalled();
		expect(withForceSpy).toHaveBeenCalledWith(pageFilePath, false, []);
	});

	it('ensures page-layout-normalization vendor only for MDX page graphs', async () => {
		const tsxRenderer = createRenderer({ forceBrowserGraph: true });
		const mdxAssetProcessingService = createAssetProcessingServiceMock();
		const mdxRenderer = new TestReactRenderer({
			appConfig: Config,
			assetProcessingService: mdxAssetProcessingService as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
			reactConfig: {
				forceBrowserGraph: true,
				mdxExtensions: ['.mdx'],
			},
		});
		const pageModule = {
			default: Page,
			config: {},
		} as EcoPageFile;

		vi.spyOn(tsxRenderer.hydrationAssetService, 'createPageBrowserGraphDependencies').mockResolvedValue([]);
		vi.spyOn(mdxRenderer.hydrationAssetService, 'createPageBrowserGraphDependencies').mockResolvedValue([]);
		const tsxEnsureSpy = vi
			.spyOn(tsxRenderer.bundleService, 'ensurePageLayoutNormalizationVendorProcessed')
			.mockResolvedValue(undefined);
		const mdxEnsureSpy = vi
			.spyOn(mdxRenderer.bundleService, 'ensurePageLayoutNormalizationVendorProcessed')
			.mockResolvedValue(undefined);

		tsxRenderer.isMdxFileOverride = false;
		mdxRenderer.isMdxFileOverride = true;

		await tsxRenderer.testCollectPageBrowserGraphContribution(pageFilePath, pageModule);
		await mdxRenderer.testCollectPageBrowserGraphContribution('/app/src/pages/guide.mdx', pageModule);

		expect(tsxEnsureSpy).not.toHaveBeenCalled();
		expect(mdxEnsureSpy).toHaveBeenCalledTimes(1);
		expect(mdxEnsureSpy).toHaveBeenCalledWith(mdxAssetProcessingService);
	});

	it('should emit canonical page data for router-backed pages inside non-react html templates', async () => {
		const testRenderer = createRenderer({ routerAdapter: mockRouterAdapter });
		testRenderer.htmlTemplate = NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
		testRenderer.importedPageFileOverride = {
			default: Page,
			config: {},
		} as EcoPageFile;

		const result = await testRenderer.execute({
			file: pageFilePath,
			params: {},
			query: {},
		});

		const text = await new Response(result.body as BodyInit).text();
		expect(text).toContain('<script id="__ECO_PAGE_DATA__" type="application/json">');
		expect(text).not.toContain('__ECO_PAGE_DATA_FALLBACK__');
	});

	it.each([
		{
			name: 'a router with a React html template',
			reactConfig: { routerAdapter: mockRouterAdapter },
			htmlTemplate: HtmlTemplate,
		},
		{
			name: 'a non-react html template without a router',
			reactConfig: undefined,
			htmlTemplate: NonReactHtmlTemplate,
		},
	])('builds the route payload once for $name', async ({ reactConfig, htmlTemplate }) => {
		const testRenderer = createRenderer(reactConfig);
		testRenderer.htmlTemplate = htmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
		testRenderer.importedPageFileOverride = {
			default: Page,
			config: {},
		} as EcoPageFile;
		const buildSerializedPageProps = vi.spyOn(testRenderer.pagePayloadService, 'buildSerializedPageProps');

		await testRenderer.execute({
			file: pageFilePath,
			params: {},
			query: {},
		});

		expect(buildSerializedPageProps).toHaveBeenCalledTimes(1);
	});

	it('should preserve unresolved eco-marker artifact html through non-react html templates', async () => {
		const testRenderer = createRenderer();
		const MarkerPage = (() =>
			'<eco-marker data-eco-node-id="n_1" data-eco-integration="lit" data-eco-component-ref="cmp" data-eco-props-ref="p_1"></eco-marker>') as unknown as EcoComponent<object>;

		const body = await testRenderer.render({
			params: {},
			query: {},
			props: {},
			resolvedDependencies: [],
			file: pageFilePath,
			metadata: {
				title: 'Marker Page',
				description: 'Marker Description',
			},
			dependencies: {
				scripts: [],
				stylesheets: [],
			},
			Page: MarkerPage,
			HtmlTemplate: NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps, JSX.Element>,
		});

		const text = await new Response(body as BodyInit).text();
		expect(text).toContain('<eco-marker data-eco-node-id="n_1"');
		expect(text).not.toContain('&lt;eco-marker');
		expect(text).not.toContain('&amp;lt;eco-marker');
	});

	it('should preserve unresolved eco-marker artifact html through react html templates', async () => {
		const testRenderer = createRenderer();
		const MarkerPage = (() =>
			'<eco-marker data-eco-node-id="n_1" data-eco-integration="lit" data-eco-component-ref="cmp" data-eco-props-ref="p_1"></eco-marker>') as unknown as EcoComponent<object>;

		const body = await testRenderer.render({
			params: {},
			query: {},
			props: {},
			resolvedDependencies: [],
			file: pageFilePath,
			metadata: {
				title: 'Marker Page',
				description: 'Marker Description',
			},
			dependencies: {
				scripts: [],
				stylesheets: [],
			},
			Page: MarkerPage,
			HtmlTemplate,
		});

		const text = await new Response(body as BodyInit).text();
		expect(text).toContain('<eco-marker data-eco-node-id="n_1"');
		expect(text).not.toContain('&lt;eco-marker');
	});

	it('should resolve deferred cross-integration layout components in render', async () => {
		const deferredPlugin = createDeferredIntegrationPlugin();
		const config = await createTestAppConfig({
			distDir: testDir,
			integrations: [deferredPlugin],
		});

		const testRenderer = new TestReactRenderer({
			appConfig: config,
			assetProcessingService: createAssetProcessingServiceMock() as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;

		const DeferredWidget = eco.component<{}, string>({
			identity: {
				id: 'deferred-widget',
				file: '/app/components/deferred-widget.deferred.tsx',
				integration: 'deferred',
			},
			integration: 'deferred',
			render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
		});

		const NonReactLayout = (({ children }: { children: string }) =>
			`<main class="layout">${children}${DeferredWidget({})}</main>`) as EcoComponent<{ children: string }>;
		NonReactLayout.config = {
			integration: 'html',
			dependencies: {
				components: [DeferredWidget],
			},
		};

		const body = await testRenderer.render({
			params: {},
			query: {},
			props: {},
			resolvedDependencies: [],
			file: pageFilePath,
			metadata: {
				title: 'Test Page',
				description: 'Test Description',
			},
			dependencies: {
				scripts: [],
				stylesheets: [],
			},
			Page,
			Layout: NonReactLayout,
			HtmlTemplate: NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps, JSX.Element>,
			pageProps: {},
		});

		const text = await new Response(body as BodyInit).text();
		expect(text).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
		expect(text).not.toContain('<eco-marker');
	});

	describe('renderExplicitView', () => {
		it('should stamp router-backed documents with an explicit owner marker', async () => {
			const testRenderer = createRenderer({ routerAdapter: mockRouterAdapter });
			const MockView = ((props: { title: string }) => <h1>{props.title}</h1>) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderExplicitView(MockView, { title: 'Marked' }, {});
			const body = await response.text();

			expect(body).toContain(`<html lang="en" ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`);
		});

		it('should emit canonical page data for router-backed views inside non-react html templates', async () => {
			const testRenderer = createRenderer({ routerAdapter: mockRouterAdapter });
			testRenderer.htmlTemplate = NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
			const MockView = ((props: { title: string }) => <h1>{props.title}</h1>) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderExplicitView(MockView, { title: 'Hello React' }, {});
			const body = await response.text();

			expect(body).toContain('<script id="__ECO_PAGE_DATA__" type="application/json">');
			expect(body).toContain('<h1>Hello React</h1>');
		});

		it('should emit hydration assets for full view rendering through the shared page browser graph path', async () => {
			const testRenderer = createRenderer();
			const MockView = ((props: { title: string }) => <h1>{props.title}</h1>) as unknown as EcoComponent<{
				title: string;
			}>;
			MockView.config = {
				identity: {
					id: 'mock-view',
					file: pageFilePath,
					integration: 'react',
				},
			};

			testRenderer.importedPageFileOverride = {
				default: Page,
				config: {},
			} as EcoPageFile;
			testRenderer.shouldHydratePageOverride = true;
			testRenderer.isMdxFileOverride = false;
			testRenderer.declaredModulesOverride = [];
			testRenderer.pageBrowserGraphOverride = {
				entryAssets: [
					{
						kind: 'script',
						srcUrl: '/assets/react-hydration.js',
						position: 'body',
						attributes: { type: 'module' },
					},
				] as ProcessedAsset[],
				chunkAssets: [
					{
						kind: 'script',
						srcUrl: '/assets/react-hydration.chunk.js',
						position: 'body',
						packageRole: 'dynamic-chunk',
					},
				] as ProcessedAsset[],
			};

			const response = await testRenderer.renderExplicitView(MockView, { title: 'Hello React' }, {});
			const body = await response.text();

			expect(body).toContain('/assets/react-hydration.js');
			expect(body).not.toContain('/assets/react-hydration.chunk.js');
		});

		it('should resolve deferred foreign boundaries in partial views through explicit component rendering', async () => {
			const deferredPlugin = createDeferredIntegrationPlugin();
			const config = await createTestAppConfig({
				distDir: testDir,
				integrations: [deferredPlugin],
			});

			const testRenderer = new ReactRenderer({
				appConfig: config,
				assetProcessingService: createAssetProcessingServiceMock() as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredWidget = eco.component<{}, string>({
				identity: {
					id: 'deferred-widget-partial',
					file: '/app/components/deferred-widget-partial.deferred.tsx',
					integration: 'deferred',
				},
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});

			const View = eco.component<{ content: string }, JSX.Element>({
				integration: 'react',
				dependencies: {
					components: [DeferredWidget],
				},
				render: ({ content }) => (
					<section>
						{content}
						{DeferredWidget({}) as unknown as React.ReactNode}
					</section>
				),
			});

			const response = await testRenderer.renderExplicitView(View, { content: 'Partial' }, { partial: true });
			const body = await response.text();

			expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
			expect(body).toContain('<section>Partial');
			expect(body).not.toContain('<eco-marker');
		});

		it('should render full views through explicit component boundaries for non-react layouts', async () => {
			const deferredPlugin = createDeferredIntegrationPlugin();
			const config = await createTestAppConfig({
				distDir: testDir,
				integrations: [deferredPlugin],
			});

			const testRenderer = new TestReactRenderer({
				appConfig: config,
				assetProcessingService: createAssetProcessingServiceMock() as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			testRenderer.htmlTemplate = NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;

			const DeferredWidget = eco.component<{}, string>({
				identity: {
					id: 'deferred-widget-view',
					file: '/app/components/deferred-widget-view.deferred.tsx',
					integration: 'deferred',
				},
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});

			const NonReactLayout = (({ children }: { children: string }) =>
				`<main class="layout">${children}${DeferredWidget({})}</main>`) as EcoComponent<{ children: string }>;
			NonReactLayout.config = {
				integration: 'html',
				dependencies: {
					components: [DeferredWidget],
				},
			};

			const View = ((props: { message: string }) => <p>{props.message}</p>) as unknown as EcoComponent<{
				message: string;
			}>;
			View.config = { layouts: [NonReactLayout] };

			const response = await testRenderer.renderExplicitView(View, { message: 'With Layout' }, {});
			const body = await response.text();

			expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
			expect(body).toContain('<p>With Layout</p>');
			expect(body).not.toContain('<eco-marker');
		});
	});

	describe('page importing', () => {
		it('routes MDX and TSX page imports through the core page module loader and normalizes config onto the page component', async () => {
			const testRenderer = new ImportTestReactRenderer({
				appConfig: Config,
				assetProcessingService: asAssetProcessingService(createAssetProcessingServiceMock()),
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			const pageComponent = (() => null) as unknown as typeof Page;
			const mdxConfig: EcoComponentConfig = { integration: 'react' };
			const mdxPageModule: EcoPageFile & { config?: EcoComponentConfig } = {
				default: pageComponent,
				config: mdxConfig,
			};
			const baseImporter = testRenderer
				.spyOnPageLoader()
				.mockResolvedValueOnce(mdxPageModule)
				.mockResolvedValueOnce({ default: Page });

			const mdxModule = await testRenderer.importForTest('/tmp/page.mdx');
			const tsxModule = await testRenderer.importForTest('/tmp/page.tsx');

			expect(baseImporter.mock.calls.map(([file]) => file)).toEqual(['/tmp/page.mdx', '/tmp/page.tsx']);
			expect(mdxModule.default).toBe(pageComponent);
			expect((mdxModule.default as typeof pageComponent).config).toBe(mdxConfig);
			expect(tsxModule.default).toBe(Page);
		});
	});
});
