import { afterAll, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import {
	eco,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type EcoPageFile,
	type EcoPagesElement,
	type HtmlTemplateProps,
} from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
	type RouteModuleLoadOptions,
} from '@ecopages/core/route-renderer/integration-renderer';
import { fileSystem } from '@ecopages/file-system';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import React, { type JSX } from 'react';
import { ReactRenderer } from '../react-renderer';
import { getReactIslandComponentKey } from '../services/react-hydration-asset.service.ts';
import { ErrorPage } from './fixture/error-page';
import { Page } from './fixture/test-page';

const mockRouterAdapter = {
	name: 'test-router',
	bundle: {
		importPath: '@test/router/browser',
		outputName: 'test-router',
		externals: ['react', 'react-dom'],
	},
	importMapKey: '@test/router',
	components: {
		router: 'TestRouter',
		pageContent: 'TestPageContent',
	},
	getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
};

const testDir = path.join(__dirname, 'fixture/.eco');

const Config = await new ConfigBuilder()
	.setDistDir(testDir)
	.setRobotsTxt({
		preferences: {
			'*': [],
		},
	})
	.setIntegrations([])
	.setDefaultMetadata({
		title: 'Ecopages',
		description: 'Ecopages',
	})
	.setBaseUrl('http://localhost:3000')
	.build();

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
const errorPageFile = path.resolve(__dirname, 'fixture/error-page.tsx');

type TestReactRuntimeModules = {
	react: Pick<typeof React, 'createElement' | 'Fragment'>;
	reactDomServer: Pick<typeof import('react-dom/server'), 'renderToReadableStream' | 'renderToString'>;
};

const renderer = new ReactRenderer({
	appConfig: Config,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

class TestReactRenderer extends ReactRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
	importedPageFileOverride?: EcoPageFile;
	shouldHydratePageOverride?: boolean;
	isMdxFileOverride?: boolean;
	declaredModulesOverride?: string[];
	routeRenderAssetsOverride?: Awaited<ReturnType<ReactRenderer['buildRouteRenderAssets']>>;
	reactRuntimeModulesOverride?: TestReactRuntimeModules;

	constructor(options: ConstructorParameters<typeof ReactRenderer>[0]) {
		super(options);

		const originalShouldHydratePage = this.pageModuleService.shouldHydratePage.bind(this.pageModuleService);
		const originalIsMdxFile = this.pageModuleService.isMdxFile.bind(this.pageModuleService);
		const originalCollectPageDeclaredModules = this.pageModuleService.collectPageDeclaredModules.bind(
			this.pageModuleService,
		);
		const originalBuildRouteRenderAssets = this.hydrationAssetService.buildRouteRenderAssets.bind(
			this.hydrationAssetService,
		);

		this.pageModuleService.shouldHydratePage = ((pageModule) =>
			this.shouldHydratePageOverride ??
			originalShouldHydratePage(pageModule)) as typeof this.pageModuleService.shouldHydratePage;
		this.pageModuleService.isMdxFile = ((filePath) =>
			this.isMdxFileOverride ?? originalIsMdxFile(filePath)) as typeof this.pageModuleService.isMdxFile;
		this.pageModuleService.collectPageDeclaredModules = ((pageModule) =>
			this.declaredModulesOverride ??
			originalCollectPageDeclaredModules(pageModule)) as typeof this.pageModuleService.collectPageDeclaredModules;
		this.hydrationAssetService.buildRouteRenderAssets = (async (pagePath, isMdx, declaredModules) =>
			this.routeRenderAssetsOverride ??
			originalBuildRouteRenderAssets(
				pagePath,
				isMdx,
				declaredModules,
			)) as typeof this.hydrationAssetService.buildRouteRenderAssets;
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
}

const createRenderer = () => {
	return new TestReactRenderer({
		appConfig: Config,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
};

class DeferredRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'deferred';

	async render(): Promise<string> {
		return '';
	}

	override async renderComponent() {
		return {
			html: '<button data-testid="deferred-widget">Deferred widget</button>',
			canAttachAttributes: true,
			rootTag: 'button',
			integrationName: this.name,
		};
	}

	async renderToResponse<P = Record<string, unknown>>(
		_view: EcoComponent<P>,
		_props: P,
		_ctx: RenderToResponseContext,
	) {
		return new Response('');
	}
}

class DeferredPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer = DeferredRenderer;

	constructor() {
		super({
			name: 'deferred',
			extensions: ['.deferred.tsx'],
		});
	}
}

class ImportTestReactRenderer extends ReactRenderer {
	public async importForTest(file: string) {
		return this.importPageFile(file);
	}
}

const createRendererWithAssets = () => {
	const assetProcessingService = {
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		processDependencies: vi.fn(async () => []),
	};

	const testRenderer = new TestReactRenderer({
		appConfig: Config,
		assetProcessingService: assetProcessingService as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
	return { testRenderer, assetProcessingService };
};

describe('ReactRenderer', () => {
	describe('renderComponent', () => {
		it('should configure the page module service to use the work directory for internal outputs', () => {
			expect((renderer.pageModuleService as any).config.workDir).toBe(Config.absolutePaths.workDir);
		});

		it('should render a single React component with structured output', async () => {
			const testRenderer = createRenderer();
			const Component = ((props: { title: string }) => <h2>{props.title}</h2>) as unknown as EcoComponent<{
				title: string;
			}>;

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'React Component' },
			});

			expect(result.integrationName).toBe('react');
			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootTag).toBe('h2');
			expect(result.html).toContain('<h2>React Component</h2>');
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
				__eco: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'Island' },
				integrationContext: { componentInstanceId: 'island-1' },
			});

			expect(result.canAttachAttributes).toBe(true);
			expect(result.html).toBe('<h3>Island</h3>');
			expect(result.html).not.toContain('<div');
			expect(result.rootAttributes?.['data-eco-component-id']).toBe('island-1');
			expect(result.rootAttributes?.['data-eco-component-key']).toBe(
				getReactIslandComponentKey(pageFilePath, Component.config),
			);
			expect(result.rootAttributes?.['data-eco-props']).toBe(btoa(JSON.stringify({ title: 'Island' })));
			expect(assetProcessingService.processDependencies).toHaveBeenCalled();
		});

		it('should not emit island assets when no componentInstanceId is provided', async () => {
			const originalRouterAdapter = ReactRenderer.routerAdapter;
			ReactRenderer.routerAdapter = mockRouterAdapter;

			try {
				const { testRenderer, assetProcessingService } = createRendererWithAssets();
				const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
					title: string;
				}>;
				Component.config = {
					__eco: {
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
			} finally {
				ReactRenderer.routerAdapter = originalRouterAdapter;
			}
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
				__eco: {
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

		it('should eagerly emit SSR-marked lazy scripts for declared MDX component dependencies', async () => {
			const assetProcessingService = {
				getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
				processDependencies: vi.fn(async (dependencies: Array<Record<string, unknown>>) =>
					dependencies.map((dependency) => ({
						kind: dependency.kind as 'script' | 'stylesheet',
						filepath: dependency.source === 'file' ? (dependency.filepath as string) : undefined,
						attributes: dependency.attributes as Record<string, string> | undefined,
						excludeFromHtml: dependency.excludeFromHtml as boolean | undefined,
					})),
				),
			};

			const testRenderer = new TestReactRenderer({
				appConfig: Config,
				assetProcessingService: assetProcessingService as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const declaredLitComponent = (() => null) as unknown as EcoComponent<object>;
			declaredLitComponent.config = {
				__eco: {
					id: 'declared-lit-counter',
					file: path.resolve(__dirname, 'fixture/declared-lit-counter.lit.tsx'),
					integration: 'lit',
				},
				dependencies: {
					scripts: [
						{
							src: './declared-lit-counter.script.ts',
							lazy: { 'on:interaction': 'click' },
							ssr: true,
						},
					],
				},
			};

			testRenderer.importedPageFileOverride = {
				default: Page,
				config: {
					dependencies: {
						components: [declaredLitComponent],
					},
				},
			} as EcoPageFile;

			const assets = await (testRenderer as any).processMdxConfigDependencies(
				path.resolve(__dirname, 'fixture/react-content.mdx'),
			);

			expect(assetProcessingService.processDependencies).toHaveBeenCalledTimes(2);
			expect(assetProcessingService.processDependencies).toHaveBeenNthCalledWith(
				2,
				[
					expect.objectContaining({
						kind: 'script',
						source: 'file',
						filepath: path.resolve(__dirname, 'fixture/declared-lit-counter.script.ts'),
						position: 'head',
						attributes: {
							type: 'module',
							defer: '',
						},
					}),
				],
				`react-mdx-ssr-lazy:${path.resolve(__dirname, 'fixture/react-content.mdx')}`,
			);
			expect(assets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						filepath: path.resolve(__dirname, 'fixture/declared-lit-counter.script.ts'),
						excludeFromHtml: undefined,
					}),
				]),
			);
		});

		it('should omit guarded locals from hydrated component props', async () => {
			const { testRenderer } = createRendererWithAssets();
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
				locals?: unknown;
			}>;
			Component.config = {
				__eco: {
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

			class DeferredBoundaryRenderer extends IntegrationRenderer<EcoPagesElement> {
				name = 'deferred';

				async render(): Promise<string> {
					return '';
				}

				override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
					return deferredRenderComponent(input);
				}

				async renderToResponse<P = Record<string, unknown>>(
					_view: EcoComponent<P>,
					_props: P,
					_ctx: RenderToResponseContext,
				) {
					return new Response('');
				}
			}

			class DeferredBoundaryPlugin extends IntegrationPlugin<EcoPagesElement> {
				renderer = DeferredBoundaryRenderer;

				constructor() {
					super({
						name: 'deferred',
						extensions: ['.deferred.tsx'],
					});
				}
			}

			const deferredPlugin = new DeferredBoundaryPlugin();
			const config = await new ConfigBuilder()
				.setDistDir(testDir)
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([deferredPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			deferredPlugin.setConfig(config);
			deferredPlugin.setRuntimeOrigin('http://localhost:3000');

			const testRenderer = new TestReactRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredShell = eco.component<{ children?: React.ReactNode }, string>({
				integration: 'deferred',
				render: () => '',
			});
			DeferredShell.config = {
				...DeferredShell.config,
				__eco: {
					id: 'deferred-shell',
					file: '/app/components/deferred-shell.deferred.tsx',
					integration: 'deferred',
				},
			};

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

			const result = await testRenderer.renderComponentBoundary({
				component: Shell,
				props: { label: 'Host' },
				children: '<span data-child="true">Child</span>',
				integrationContext: { componentInstanceId: 'host' },
			});

			expect(result.html).toContain('<h2>Host</h2>');
			expect(result.html).toContain(
				'<aside data-eco-component-id="host_n_1" data-slot="true"><span data-child="true">Child</span><button data-testid="deferred-widget">Deferred widget</button></aside>',
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
	});

	it('should render boundaries with the app-scoped React runtime', async () => {
		const createElement = vi.fn((component: unknown, props: unknown, ...children: unknown[]) => ({
			component,
			props,
			children,
		})) as unknown as typeof React.createElement;
		const renderToString = vi.fn((value: unknown) => JSON.stringify(value));
		const testRenderer = createRenderer();
		testRenderer.reactRuntimeModulesOverride = {
			react: {
				createElement,
				Fragment: 'fragment-token' as unknown as typeof React.Fragment,
			},
			reactDomServer: {
				renderToReadableStream: vi.fn(
					async () => new ReadableStream(),
				) as unknown as typeof import('react-dom/server').renderToReadableStream,
				renderToString: renderToString as unknown as typeof import('react-dom/server').renderToString,
			},
		};

		const Boundary = eco.component<{ label: string }, JSX.Element>({
			integration: 'react',
			render: ({ label }) => <section>{label}</section>,
		});

		const result = await testRenderer.renderComponentBoundary({
			component: Boundary,
			props: { label: 'Hello' },
		});

		expect(result.html).toContain('"label":"Hello"');
		expect(createElement).toHaveBeenCalled();
		expect(renderToString).toHaveBeenCalledTimes(1);
	});

	afterAll(() => {
		if (fileSystem.exists(testDir)) {
			fileSystem.remove(testDir);
		}
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

	it('should keep emitting route hydration assets in development', async () => {
		const testRenderer = createRenderer();
		const originalNodeEnv = process.env.NODE_ENV;
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
		testRenderer.routeRenderAssetsOverride = hydrationAssets;

		try {
			process.env.NODE_ENV = 'development';

			await expect(testRenderer.buildRouteRenderAssets(pageFilePath)).resolves.toEqual(hydrationAssets);
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('should emit canonical page data for router-backed pages inside non-react html templates', async () => {
		const testRenderer = createRenderer();
		const originalRouterAdapter = ReactRenderer.routerAdapter;
		ReactRenderer.routerAdapter = mockRouterAdapter;

		try {
			const body = await testRenderer.render({
				params: {},
				query: {},
				props: { routeFiles: ['a.tsx'] },
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
				HtmlTemplate: NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps, JSX.Element>,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<script id="__ECO_PAGE_DATA__" type="application/json">');
			expect(text).not.toContain('__ECO_PAGE_DATA_FALLBACK__');
		} finally {
			ReactRenderer.routerAdapter = originalRouterAdapter;
		}
	});

	it('should preserve unresolved boundary artifact html through non-react html templates', async () => {
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

	it('should preserve unresolved boundary artifact html through react html templates', async () => {
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

	it('should throw an error if the page fails to render', async () => {
		await expect(
			renderer.render({
				params: {},
				query: {},
				props: {},
				file: errorPageFile,
				resolvedDependencies: [],
				metadata: {
					title: 'Error Page',
					description: 'Error Description',
				},
				dependencies: {
					scripts: [],
					stylesheets: [],
				},
				Page: ErrorPage,
				HtmlTemplate,
			}),
		).rejects.toThrow('Failed to render component');
	});

	it('should resolve deferred cross-integration layout components in render', async () => {
		const deferredPlugin = new DeferredPlugin();
		const config = await new ConfigBuilder()
			.setDistDir(testDir)
			.setRobotsTxt({
				preferences: {
					'*': [],
				},
			})
			.setIntegrations([deferredPlugin])
			.setDefaultMetadata({
				title: 'Ecopages',
				description: 'Ecopages',
			})
			.setBaseUrl('http://localhost:3000')
			.build();

		deferredPlugin.setConfig(config);
		deferredPlugin.setRuntimeOrigin('http://localhost:3000');

		const testRenderer = new TestReactRenderer({
			appConfig: config,
			assetProcessingService: {} as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;

		const DeferredWidget = eco.component<{}, string>({
			integration: 'deferred',
			render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
		});
		DeferredWidget.config = {
			...DeferredWidget.config,
			__eco: {
				id: 'deferred-widget',
				file: '/app/components/deferred-widget.deferred.tsx',
				integration: 'deferred',
			},
		};

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

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const testRenderer = createRenderer();
			const MockView = ((props: { title: string }) => <h1>{props.title}</h1>) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderToResponse(MockView, { title: 'Hello React' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello React</h1>');
		});

		it('should stamp router-backed documents with an explicit owner marker', async () => {
			const testRenderer = createRenderer();
			const MockView = ((props: { title: string }) => <h1>{props.title}</h1>) as unknown as EcoComponent<{
				title: string;
			}>;
			const originalRouterAdapter = ReactRenderer.routerAdapter;
			ReactRenderer.routerAdapter = mockRouterAdapter;

			try {
				const response = await testRenderer.renderToResponse(MockView, { title: 'Marked' }, {});
				const body = await response.text();

				expect(body).toContain(`<html lang="en" ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router">`);
			} finally {
				ReactRenderer.routerAdapter = originalRouterAdapter;
			}
		});

		it('should render a partial view without full HTML wrapper', async () => {
			const testRenderer = createRenderer();
			const MockView = ((props: { content: string }) => <div>{props.content}</div>) as unknown as EcoComponent<{
				content: string;
			}>;

			const response = await testRenderer.renderToResponse(MockView, { content: 'Partial' }, { partial: true });

			const body = await response.text();
			expect(body).toContain('<div>Partial</div>');
		});

		it('should resolve deferred foreign boundaries in partial views through explicit component rendering', async () => {
			const deferredPlugin = new DeferredPlugin();
			const config = await new ConfigBuilder()
				.setDistDir(testDir)
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([deferredPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			deferredPlugin.setConfig(config);
			deferredPlugin.setRuntimeOrigin('http://localhost:3000');

			const testRenderer = new ReactRenderer({
				appConfig: config,
				assetProcessingService: {} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredWidget = eco.component<{}, string>({
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});
			DeferredWidget.config = {
				...DeferredWidget.config,
				__eco: {
					id: 'deferred-widget-partial',
					file: '/app/components/deferred-widget-partial.deferred.tsx',
					integration: 'deferred',
				},
			};

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

			const response = await testRenderer.renderToResponse(View, { content: 'Partial' }, { partial: true });
			const body = await response.text();

			expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
			expect(body).toContain('<section>Partial');
			expect(body).not.toContain('<eco-marker');
		});

		it('should apply custom status code', async () => {
			const testRenderer = createRenderer();
			const MockView = (() => <p>Not Found</p>) as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(MockView, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const testRenderer = createRenderer();
			const MockView = (() => <p>Cached</p>) as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(
				MockView,
				{},
				{
					headers: {
						'Cache-Control': 'max-age=3600',
						'X-Custom-Header': 'test-value',
					},
				},
			);

			expect(response.headers.get('Cache-Control')).toBe('max-age=3600');
			expect(response.headers.get('X-Custom-Header')).toBe('test-value');
		});

		it('should render with layout when not partial', async () => {
			const testRenderer = createRenderer();
			const MockLayout = (({ children }: { children: JSX.Element }) => (
				<main className="layout">{children}</main>
			)) as unknown as EcoComponent<{ children: JSX.Element }>;

			const MockView = ((props: { message: string }) => <p>{props.message}</p>) as unknown as EcoComponent<{
				message: string;
			}>;
			MockView.config = { layout: MockLayout };

			const response = await testRenderer.renderToResponse(MockView, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('layout');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('should render full views through explicit component boundaries for non-react layouts', async () => {
			const deferredPlugin = new DeferredPlugin();
			const config = await new ConfigBuilder()
				.setDistDir(testDir)
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([deferredPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			deferredPlugin.setConfig(config);
			deferredPlugin.setRuntimeOrigin('http://localhost:3000');

			const testRenderer = new TestReactRenderer({
				appConfig: config,
				assetProcessingService: {} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			testRenderer.htmlTemplate = NonReactHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;

			const DeferredWidget = eco.component<{}, string>({
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});
			DeferredWidget.config = {
				...DeferredWidget.config,
				__eco: {
					id: 'deferred-widget-view',
					file: '/app/components/deferred-widget-view.deferred.tsx',
					integration: 'deferred',
				},
			};

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
			View.config = { layout: NonReactLayout };

			const response = await testRenderer.renderToResponse(View, { message: 'With Layout' }, {});
			const body = await response.text();

			expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
			expect(body).toContain('<p>With Layout</p>');
			expect(body).not.toContain('<eco-marker');
		});

		it('should throw an error if the view fails to render', async () => {
			const testRenderer = createRenderer();
			const MockView = (() => {
				throw new Error('View failed to render');
			}) as unknown as EcoComponent<object>;

			await expect(testRenderer.renderToResponse(MockView, {}, {})).rejects.toThrow('Failed to render view');
		});
	});

	describe('page importing', () => {
		it('uses the integration-specific importer only for MDX files and normalizes config onto the page component', async () => {
			const testRenderer = new ImportTestReactRenderer({
				appConfig: Config,
				assetProcessingService: {} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			const pageComponent = (() => null) as unknown as typeof Page;
			const mdxConfig = { title: 'mdx-config' } as any;
			const importMdxPageFile = vi
				.spyOn(testRenderer.pageModuleService, 'importMdxPageFile')
				.mockResolvedValue({ default: pageComponent, config: mdxConfig });
			const baseImporter = vi
				.spyOn((testRenderer as any).pageModuleLoaderService, 'importPageFile')
				.mockResolvedValue({ default: Page });

			const mdxModule = await testRenderer.importForTest('/tmp/page.mdx');
			const tsxModule = await testRenderer.importForTest('/tmp/page.tsx');

			expect(importMdxPageFile).toHaveBeenCalledWith('/tmp/page.mdx', {
				bypassCache: false,
				cacheScope: undefined,
			});
			expect(baseImporter).toHaveBeenCalledWith('/tmp/page.tsx', {
				bypassCache: false,
				cacheScope: undefined,
			});
			expect(mdxModule.default).toBe(pageComponent);
			expect((mdxModule.default as typeof pageComponent).config).toBe(mdxConfig);
			expect(tsxModule.default).toBe(Page);
		});
	});
});
