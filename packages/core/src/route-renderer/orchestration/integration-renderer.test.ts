import { describe, it, expect, vi } from 'vitest';
import { eco } from '../../eco/eco.ts';
import { IntegrationRenderer, type RenderToResponseContext } from './integration-renderer.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import { getComponentRenderContext, type ComponentBoundaryRuntime } from './component-render-context.ts';
import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	BoundaryRenderPayload,
	RouteRendererBody,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	EcoPageFile,
	RouteRendererOptions,
	EcoComponent,
	HtmlTemplateProps,
} from '../../types/public-types.ts';
import type { EcoPageComponent } from '../../eco/eco.types.ts';
import { runWithComponentRenderContext } from './component-render-context.ts';

function createBoundaryMarker(nodeId: string, componentRef: string, propsRef: string): string {
	return `<eco-marker data-eco-node-id="${nodeId}" data-eco-component-ref="${componentRef}" data-eco-props-ref="${propsRef}"></eco-marker>`;
}

/**
 * Concrete implementation with ed file loading for testing purposes.
 */
class TestIntegrationRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test-renderer';
	BoundaryRuntimeCreationCount = 0;
	BoundaryRenderCount = 0;

	/** Mock data container for page module */
	PageModule: EcoPageFile | null = null;
	/** Mock HTML template container */
	HtmlTemplate: EcoComponent<HtmlTemplateProps> | null = null;
	RenderedBody: RouteRendererBody = '<html><body>Test Page</body></html>';
	RenderBodyFactory:
		| ((context: ReturnType<typeof getComponentRenderContext>) => RouteRendererBody | Promise<RouteRendererBody>)
		| null = null;
	MockComponentRenderResult: ComponentRenderResult | null = null;
	ImportedFiles: string[] = [];

	async render(_options: IntegrationRendererRenderOptions<EcoPagesElement>): Promise<RouteRendererBody> {
		if (this.RenderBodyFactory) {
			return await this.RenderBodyFactory(getComponentRenderContext());
		}

		return this.RenderedBody;
	}

	override async renderComponent(_input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (this.MockComponentRenderResult) {
			return this.MockComponentRenderResult;
		}

		return super.renderComponent(_input);
	}

	override async renderComponentBoundary(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		this.BoundaryRenderCount += 1;
		return await super.renderComponentBoundary(input);
	}

	async renderToResponse<P>(view: EcoComponent<P>, props: P, ctx: RenderToResponseContext): Promise<Response> {
		const viewFn = view as (props: P) => EcoPagesElement;
		const content = viewFn(props);

		let body: string;
		if (ctx.partial) {
			body = content as string;
		} else {
			const Layout = view.config?.layout as ((props: { children: string }) => string) | undefined;
			const children = Layout ? Layout({ children: content as string }) : content;
			body = `<!DOCTYPE html><html><body>${children}</body></html>`;
		}

		const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
		if (ctx.headers) {
			for (const [key, value] of Object.entries(ctx.headers)) {
				headers.set(key, value);
			}
		}

		return new Response(body, {
			status: ctx.status ?? 200,
			headers,
		});
	}

	/**
	 * Override protected methods to return data.
	 */
	protected override async importPageFile(_file: string): Promise<EcoPageFile> {
		this.ImportedFiles.push(_file);
		if (!this.PageModule) throw new Error('Mock page module not set');
		return this.PageModule;
	}

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		if (!this.HtmlTemplate) throw new Error('Mock HTML template not set');
		return this.HtmlTemplate;
	}

	/**
	 * Override to avoid asset processing service dependency in tests.
	 */
	protected override async resolveDependencies(
		_components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		return [];
	}

	protected override async buildRouteRenderAssets(_file: string): Promise<ProcessedAsset[]> {
		return [];
	}

	/**
	 * Expose protected method for testing.
	 */
	public async testPrepareRenderOptions(options: RouteRendererOptions) {
		return this.prepareRenderOptions(options);
	}

	public async testProcessComponentDependencies(components: (EcoComponent | Partial<EcoComponent>)[]) {
		return this.processComponentDependencies(components);
	}

	public testShouldResolveBoundaryInOwningRenderer(input: {
		currentIntegration: string;
		targetIntegration?: string;
	}) {
		return this.shouldResolveBoundaryInOwningRenderer(input);
	}

	public testHasForeignBoundaryDescendants(component: EcoComponent) {
		return this.hasForeignBoundaryDescendants(component);
	}

	public async testResolveBoundaryInOwningRenderer(
		input: ComponentRenderInput,
		rendererCache = new Map<string, IntegrationRenderer<any>>(),
	) {
		return this.resolveBoundaryInOwningRenderer(input, rendererCache);
	}

	public async testGetHtmlTemplate() {
		return this.getHtmlTemplate();
	}

	public async testBaseGetHtmlTemplate() {
		return super.getHtmlTemplate();
	}

	public testGetRendererBootstrapDependencies(partial = false) {
		return this.getRendererBootstrapDependencies(partial);
	}

	public async testFinalizeResolvedHtml(options: { html: string; partial?: boolean }) {
		return this.finalizeResolvedHtml({
			html: options.html,
			partial: options.partial,
		});
	}

	public async testRenderPartialViewResponse<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx?: RenderToResponseContext;
		renderInline?: () => Promise<BodyInit>;
		transformHtml?: (html: string) => string;
	}) {
		return this.renderPartialViewResponse({
			view: input.view,
			props: input.props,
			ctx: input.ctx ?? { partial: true },
			renderInline: input.renderInline,
			transformHtml: input.transformHtml,
		});
	}

	public async testRenderViewWithDocumentShell<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx?: RenderToResponseContext;
		layout?: EcoComponent;
	}) {
		return this.renderViewWithDocumentShell({
			view: input.view,
			props: input.props,
			ctx: input.ctx ?? {},
			layout: input.layout,
		});
	}

	public async testRenderBoundary(input: ComponentRenderInput) {
		return this.renderBoundary(input);
	}

	protected override createComponentBoundaryRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ComponentBoundaryRuntime {
		this.BoundaryRuntimeCreationCount += 1;
		return super.createComponentBoundaryRuntime(options);
	}
}

describe('IntegrationRenderer', () => {
	const AppConfig = {
		absolutePaths: {
			pagesDir: '/app/pages',
			htmlTemplatePath: '/app/index.ghtml.ts',
		},
		integrations: [],
		defaultMetadata: {
			title: 'Default Title',
			description: 'Default Description',
		},
		srcDir: '/app',
	} as unknown as EcoPagesAppConfig;

	const AssetService = {
		processDependencies: vi.fn(() => Promise.resolve([])),
	} as unknown as AssetProcessingService;

	it('should extract cache strategy from page component (static property)', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		/** Mock page with cache strategy */
		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		/** Simulate eco.page() attaching cache config */
		PageIdx.cache = { revalidate: 60 };

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/cached-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
	});

	it('should return undefined cache strategy if not present', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		/** Mock page without cache strategy */
		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/simple-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.cacheStrategy).toBeUndefined();
	});

	it('should resolve static props and metadata correctly', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		/** Attached static methods */
		PageIdx.staticProps = async () => ({ props: { title: 'Dynamic Title' } });
		PageIdx.metadata = async ({ props }: { props: Record<string, unknown> }) => ({
			title: props.title as string,
			description: 'Dynamic Description',
		});

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/props-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.props).toEqual({ title: 'Dynamic Title' });
		expect(result.metadata?.title).toBe('Dynamic Title');
	});

	it('should prefer renderer module html template path when provided', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				runtime: {
					rendererModuleContext: {
						htmlTemplateModulePath: '/virtual/includes/html.kita.tsx',
					},
				},
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		renderer.PageModule = {
			default: (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>,
		};

		await renderer.testBaseGetHtmlTemplate();

		expect(renderer.ImportedFiles).toContain('/virtual/includes/html.kita.tsx');
	});

	it('should expose island bootstrap dependencies from renderer modules', () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				runtime: {
					rendererModuleContext: {
						islandClientModuleId: 'virtual:ecopages/island-client.ts',
					},
				},
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		expect(renderer.testGetRendererBootstrapDependencies()).toEqual([
			{
				attributes: {
					crossorigin: 'anonymous',
					'data-ecopages-runtime': 'islands',
					type: 'module',
				},
				content: 'import "virtual:ecopages/island-client.ts";',
				inline: true,
				kind: 'script',
				position: 'body',
			},
		]);
		expect(renderer.testGetRendererBootstrapDependencies(true)).toEqual([]);
	});

	it('should inject the island client bootstrap into finalized full-document HTML', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				runtime: {
					rendererModuleContext: {
						islandClientModuleId: 'virtual:ecopages/island-client.ts',
					},
				},
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const html = await renderer.testFinalizeResolvedHtml({
			html: '<!DOCTYPE html><html><body><main>hello</main></body></html>',
		});

		expect(html).toContain('data-ecopages-runtime="islands"');
		expect(html).toContain('import "virtual:ecopages/island-client.ts";');
	});

	it('should keep layout locals safe and page locals guarded on static pages', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/static-page.ts',
			params: {},
			query: {},
		});

		expect(result.locals).toBeUndefined();
		expect(() => (result.pageLocals as Record<string, unknown>).session).toThrow();
	});

	it('should provide both locals and pageLocals on dynamic pages', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		PageIdx.cache = 'dynamic';

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const incomingLocals = { session: { userId: 'u-1' } } as Record<string, unknown>;
		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/dynamic-page.ts',
			params: {},
			query: {},
			locals: incomingLocals,
		});

		expect(result.locals).toBe(incomingLocals);
		expect(result.pageLocals).toBe(incomingLocals);
	});

	it('should include a boundary plan for page, layout, and html template roots', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				integrations: [
					{
						name: 'foreign-renderer',
					} as unknown as EcoPagesAppConfig['integrations'][number],
				],
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const Layout = (() => '<main>Layout</main>') as EcoComponent<Record<string, unknown>>;
		Layout.config = {
			__eco: {
				id: 'layout-component',
				file: '/app/layouts/default.tsx',
				integration: 'test-renderer',
			},
			dependencies: {
				components: [ForeignComponent],
			},
		};

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		PageIdx.config = {
			layout: Layout,
			__eco: {
				id: 'page-component',
				file: '/app/pages/index.tsx',
				integration: 'test-renderer',
			},
		};

		const HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
		HtmlTemplate.config = {
			__eco: {
				id: 'html-template',
				file: '/app/index.ghtml.ts',
				integration: 'test-renderer',
			},
		};

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = HtmlTemplate;

		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/index.tsx',
			params: {},
			query: {},
		});

		expect(result.boundaryPlan).toEqual(
			expect.objectContaining({
				foreignEdgeCount: 1,
				hasValidationErrors: false,
				rendererNames: expect.arrayContaining(['test-renderer', 'foreign-renderer']),
				root: expect.objectContaining({
					source: 'route',
					children: expect.arrayContaining([
						expect.objectContaining({ source: 'html-template' }),
						expect.objectContaining({ source: 'layout' }),
						expect.objectContaining({ source: 'page' }),
					]),
				}),
			}),
		);
	});

	it('should record validation errors for unknown foreign integration owners', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const UnknownForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		UnknownForeignComponent.config = {
			integration: 'missing-renderer',
			__eco: {
				id: 'missing-foreign-component',
				file: '/app/components/missing-foreign-component.tsx',
				integration: 'missing-renderer',
			},
		};

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		PageIdx.config = {
			__eco: {
				id: 'page-component',
				file: '/app/pages/index.tsx',
				integration: 'test-renderer',
			},
			dependencies: {
				components: [UnknownForeignComponent],
			},
		};

		const HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
		HtmlTemplate.config = {
			__eco: {
				id: 'html-template',
				file: '/app/index.ghtml.ts',
				integration: 'test-renderer',
			},
		};

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = HtmlTemplate;

		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/index.tsx',
			params: {},
			query: {},
		});

		expect(result.boundaryPlan?.hasValidationErrors).toBe(true);
		expect(result.boundaryPlan?.validationErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'UNKNOWN_INTEGRATION_OWNER',
					componentId: 'missing-foreign-component',
					integrationName: 'missing-renderer',
				}),
			]),
		);
	});

	it('should expose a compatibility boundary payload contract', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		renderer.MockComponentRenderResult = {
			html: '<main data-root="true">Hello</main>',
			canAttachAttributes: true,
			rootTag: 'main',
			integrationName: 'test-renderer',
			rootAttributes: { 'data-eco-component-id': 'root-1' },
			assets: [
				{
					kind: 'script',
					inline: true,
					content: 'console.log("boundary")',
					position: 'body',
				},
			],
		};

		const payload = await renderer.testRenderBoundary({
			component: (() => '<main>Hello</main>') as EcoComponent<Record<string, unknown>>,
			props: {},
		});

		expect(payload).toEqual<BoundaryRenderPayload>({
			html: '<main data-root="true">Hello</main>',
			assets: [
				{
					kind: 'script',
					inline: true,
					content: 'console.log("boundary")',
					position: 'body',
				},
			],
			rootTag: 'main',
			rootAttributes: { 'data-eco-component-id': 'root-1' },
			attachmentPolicy: { kind: 'first-element' },
			integrationName: 'test-renderer',
		});
	});

	it('should resolve foreign-owned boundaries in the owning renderer', () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const result = renderer.testShouldResolveBoundaryInOwningRenderer({
			currentIntegration: 'ghtml',
			targetIntegration: 'react',
		});

		expect(result).toBe(true);
	});

	it('should keep same-integration boundaries in the current render pass', () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const result = renderer.testShouldResolveBoundaryInOwningRenderer({
			currentIntegration: 'react',
			targetIntegration: 'react',
		});

		expect(result).toBe(false);
	});

	it('should delegate foreign component boundaries through the shared ownership helper', async () => {
		const foreignRenderer = {
			renderComponentBoundary: vi.fn(async () => ({
				html: '<aside>Owned by foreign renderer</aside>',
				canAttachAttributes: true,
				rootTag: 'aside',
				integrationName: 'foreign-renderer',
			})),
		} as unknown as IntegrationRenderer;

		const initializeRenderer = vi.fn(() => foreignRenderer);
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				integrations: [
					{
						name: 'foreign-renderer',
						initializeRenderer,
					} as unknown as EcoPagesAppConfig['integrations'][number],
				],
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		const result = await renderer.testResolveBoundaryInOwningRenderer(
			{
				component: ForeignComponent,
				props: { label: 'foreign' },
				integrationContext: { rendererCache },
			},
			rendererCache,
		);

		expect(result).toEqual(
			expect.objectContaining({
				html: '<aside>Owned by foreign renderer</aside>',
				integrationName: 'foreign-renderer',
			}),
		);
		expect(initializeRenderer).toHaveBeenCalledTimes(1);
		expect(foreignRenderer.renderComponentBoundary).toHaveBeenCalledTimes(1);
	});

	it('should preserve shared integration context fields when delegating to the owning renderer', async () => {
		const foreignRenderer = {
			renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) => ({
				html: `<aside>${String(
					(input.integrationContext as BaseIntegrationContext | undefined)?.componentInstanceId ?? 'missing',
				)}</aside>`,
				canAttachAttributes: true,
				rootTag: 'aside',
				integrationName: 'foreign-renderer',
			})),
		} as unknown as IntegrationRenderer;
		const initializeRenderer = vi.fn(() => foreignRenderer);

		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				integrations: [
					{
						name: 'foreign-renderer',
						initializeRenderer,
					} as unknown as EcoPagesAppConfig['integrations'][number],
				],
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		await renderer.testResolveBoundaryInOwningRenderer(
			{
				component: ForeignComponent,
				props: { label: 'foreign' },
				integrationContext: {
					componentInstanceId: 'host-1',
				} satisfies BaseIntegrationContext,
			},
			rendererCache,
		);

		expect(foreignRenderer.renderComponentBoundary).toHaveBeenCalledWith(
			expect.objectContaining({
				integrationContext: expect.objectContaining({
					componentInstanceId: 'host-1',
					rendererCache,
				}),
			}),
		);
	});

	it('should stop boundary delegation when the resolved owner renderer is the current renderer', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...AppConfig,
				integrations: [
					{
						name: 'foreign-renderer',
						initializeRenderer: () => renderer,
					} as unknown as EcoPagesAppConfig['integrations'][number],
				],
			} as EcoPagesAppConfig,
			assetProcessingService: AssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		const result = await renderer.testResolveBoundaryInOwningRenderer(
			{
				component: ForeignComponent,
				props: { label: 'foreign' },
				integrationContext: { rendererCache },
			},
			rendererCache,
		);

		expect(result).toBeUndefined();
	});

	it('should prefer processed lazy script srcUrl for _resolvedLazyTriggers', async () => {
		let capturedDeps: unknown[] = [];
		const LazySrcUrl = '/assets/_hmr/components/lit-counter/lit-counter.script.js';
		const Service = {
			processDependencies: vi.fn(async (deps: unknown[]) => {
				capturedDeps = deps;
				const lazyFileDep = (
					deps as Array<{
						kind?: string;
						source?: string;
						filepath?: string;
						attributes?: Record<string, string>;
					}>
				).find((dep) => dep.kind === 'script' && dep.source === 'file' && Boolean(dep.filepath));

				return [
					{
						kind: 'script',
						filepath: lazyFileDep?.filepath,
						attributes: lazyFileDep?.attributes,
						srcUrl: LazySrcUrl,
					},
				] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;

		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: Service,
			runtimeOrigin: 'http://localhost:3000',
		});

		const component = ((_) => '<lit-counter></lit-counter>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'lit-counter',
				integration: 'lit',
				file: '/app/components/lit-counter/lit-counter.kita.tsx',
			},
			dependencies: {
				scripts: [
					{
						src: './lit-counter.script.ts',
						lazy: { 'on:interaction': 'click,mouseenter,focusin' },
					},
				],
			},
		};

		await renderer.testProcessComponentDependencies([component]);

		expect(component.config._resolvedLazyScripts).toBeUndefined();
		expect(component.config._resolvedLazyTriggers).toHaveLength(1);
		expect(component.config._resolvedLazyTriggers?.[0]?.rules).toEqual([
			{
				'on:interaction': {
					value: 'click,mouseenter,focusin',
					scripts: [LazySrcUrl],
				},
			},
		]);
		expect(
			capturedDeps.some((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const candidate = dep as { source?: string; importPath?: string };
				return candidate.source === 'node-module' && candidate.importPath === '@ecopages/scripts-injector';
			}),
		).toBe(false);
	});

	it('should fallback to static lazy script URL when processed srcUrl is unavailable', async () => {
		const Service = {
			processDependencies: vi.fn(async () => {
				return [
					{
						kind: 'script',
						filepath: '/app/components/lit-counter/lit-counter.script.ts',
					},
				] as ProcessedAsset[];
			}),
		} as unknown as AssetProcessingService;

		const renderer = new TestIntegrationRenderer({
			appConfig: AppConfig,
			assetProcessingService: Service,
			runtimeOrigin: 'http://localhost:3000',
		});

		const component = ((_) => '<lit-counter></lit-counter>') as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'lit-counter',
				integration: 'lit',
				file: '/app/components/lit-counter/lit-counter.kita.tsx',
			},
			dependencies: {
				scripts: [
					{
						src: './lit-counter.script.ts',
						lazy: { 'on:interaction': 'click,mouseenter,focusin' },
					},
				],
			},
		};

		await renderer.testProcessComponentDependencies([component]);

		expect(component.config._resolvedLazyScripts).toBeUndefined();
		expect(component.config._resolvedLazyTriggers).toHaveLength(1);
		expect(component.config._resolvedLazyTriggers?.[0]?.rules).toEqual([
			{
				'on:interaction': {
					value: 'click,mouseenter,focusin',
					scripts: ['/assets/components/lit-counter/lit-counter.script.js'],
				},
			},
		]);
	});

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = ((props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{
				title: string;
			}>;

			const response = await renderer.renderToResponse(View, { title: 'Hello' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello</h1>');
		});

		it('should render a partial view without layout', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = ((props: { content: string }) => `<div>${props.content}</div>`) as EcoComponent<{
				content: string;
			}>;

			const response = await renderer.renderToResponse(View, { content: 'Partial' }, { partial: true });

			const body = await response.text();
			expect(body).toBe('<div>Partial</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = (() => '<p>Not Found</p>') as EcoComponent<object>;

			const response = await renderer.renderToResponse(View, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = (() => '<p>Cached</p>') as EcoComponent<object>;

			const response = await renderer.renderToResponse(
				View,
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
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const Layout = ((props: { children: string }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: string }>;

			const View = ((props: { message: string }) => `<p>${props.message}</p>`) as EcoComponent<{
				message: string;
			}>;
			View.config = { layout: Layout };

			const response = await renderer.renderToResponse(View, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});
	});

	describe('renderComponent', () => {
		it('should render a component with structured output', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = ((props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{ title: string }>;

			const result = await renderer.renderComponent({
				component: View,
				props: { title: 'Hello Component' },
			});

			expect(result.integrationName).toBe('test-renderer');
			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootTag).toBe('h1');
			expect(result.html).toContain('<h1>Hello Component</h1>');
		});
	});

	describe('execute component-level artifacts', () => {
		it('should handle stream-like render bodies without re-consuming disturbed responses', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody = new Response('<html><body><main>Stream Body</main></body></html>').body as BodyInit;
			renderer.PageModule = {
				default: (() => '<main>Stream Body</main>') as unknown as EcoPageComponent<any>,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Stream Body</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main>Stream Body</main>');
		});

		it('should include renderComponent assets and apply root attributes', async () => {
			const appConfig = {
				...AppConfig,
			} as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody = '<html><body><main>Test Page</main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
				rootAttributes: { 'data-eco-component-id': 'eco-page-root' },
				assets: [
					{
						kind: 'script',
						srcUrl: '/assets/island.js',
						position: 'head',
					} as ProcessedAsset,
				],
			};

			renderer.PageModule = {
				default: (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main data-eco-component-id="eco-page-root">Test Page</main>');

			const processedDeps = (renderer as any).htmlTransformer.getProcessedDependencies();
			expect(processedDeps.some((dep: ProcessedAsset) => dep.srcUrl === '/assets/island.js')).toBe(true);
		});

		it('should not force render nested dependency components without resolved props context', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async () => ({
					html: '<aside>Nested</aside>',
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'explicit-renderer',
				})),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody = '<html><body><main>Test Page</main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
				rootAttributes: { 'data-eco-component-id': 'eco-page-root' },
			};

			const NestedComponent = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
			NestedComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'nested-component',
					file: '/app/components/nested-component.ts',
					integration: 'test-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [NestedComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			expect((explicitRenderer.renderComponent as any).mock.calls).toHaveLength(0);

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main data-eco-component-id="eco-page-root">Test Page</main>');

			const processedDeps = (renderer as any).htmlTransformer.getProcessedDependencies();
			expect(processedDeps.some((dep: ProcessedAsset) => dep.srcUrl === '/assets/nested-explicit.js')).toBe(
				false,
			);
		});

		it('should include global integration dependencies for referenced component integrations once', async () => {
			const explicitIntegrationDependency = {
				kind: 'script',
				srcUrl: '/assets/react-runtime.js',
				position: 'head',
			} as ProcessedAsset;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'react',
						initializeRenderer: () => renderer as unknown as IntegrationRenderer,
						getResolvedIntegrationDependencies: () => [explicitIntegrationDependency],
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody = '<html><body><main>Test Page</main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
			};

			const ReactNested = (() => '<div>React Nested</div>') as EcoComponent<Record<string, unknown>>;
			ReactNested.config = {
				integration: 'react',
				__eco: {
					id: 'react-nested',
					file: '/app/components/react-nested.react.tsx',
					integration: 'react',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [ReactNested],
				},
			};

			renderer.PageModule = {
				default: Page,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const processedDeps = (renderer as any).htmlTransformer.getProcessedDependencies();
			expect(
				processedDeps.filter((dep: ProcessedAsset) => dep.srcUrl === '/assets/react-runtime.js'),
			).toHaveLength(1);
		});

		it('should fail route execution when unresolved boundary artifact HTML is returned', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async () => ({
					html: '<aside>Nested Render</aside>',
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'explicit-renderer',
					rootAttributes: { 'data-eco-component-id': 'nested-1' },
					assets: [
						{
							kind: 'script',
							srcUrl: '/assets/nested-render.js',
							position: 'head',
						} as ProcessedAsset,
					],
				})),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody =
				'<html><body><main>Before<eco-marker data-eco-node-id="n_1" data-eco-component-ref="nested-component" data-eco-props-ref="props-1"></eco-marker>After</main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
			};

			const NestedComponent = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
			NestedComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'nested-component',
					file: '/app/components/nested-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [NestedComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			} as unknown as EcoPageFile;
			renderer.RenderBodyFactory = () => renderer.RenderedBody;
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			await expect(
				renderer.execute({
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				}),
			).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
			expect((explicitRenderer.renderComponent as any).mock.calls).toHaveLength(0);
		});

		it('should fail route execution when unresolved boundary artifact HTML remains inside surrounding shell html', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async () => ({
					html: '<aside data-explicit-shell="nested"><span>Nested Render</span></aside>',
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'explicit-renderer',
					rootAttributes: { 'data-eco-component-id': 'nested-contract-root' },
					assets: [
						{
							kind: 'script',
							srcUrl: '/assets/explicit-contract.js',
							position: 'head',
						} as ProcessedAsset,
					],
				})),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody =
				'<html><body><main><section data-shell="outer">Before<eco-marker data-eco-node-id="n_1" data-eco-component-ref="nested-component" data-eco-props-ref="props-1"></eco-marker>After</section></main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
			};

			const NestedComponent = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
			NestedComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'nested-component',
					file: '/app/components/nested-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [NestedComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			} as unknown as EcoPageFile;
			renderer.RenderBodyFactory = () => renderer.RenderedBody;
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			await expect(
				renderer.execute({
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				}),
			).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
			expect((explicitRenderer.renderComponent as any).mock.calls).toHaveLength(0);
		});

		it('should fail route execution for deep multi-level unresolved boundary artifacts', async () => {
			const renderOrder: string[] = [];
			const explicitRenderer = {
				renderComponent: vi.fn(async (input: ComponentRenderInput) => {
					const componentId = input.component.config?.__eco?.id;
					renderOrder.push(componentId as string);

					if (componentId === 'leaf-component') {
						return {
							html: '<span>Leaf Render</span>',
							canAttachAttributes: true,
							rootTag: 'span',
							integrationName: 'explicit-renderer',
						};
					}

					if (componentId === 'parent-component') {
						return {
							html: `<section>${input.children ?? ''}</section>`,
							canAttachAttributes: true,
							rootTag: 'section',
							integrationName: 'explicit-renderer',
						};
					}

					return {
						html: `<article>${input.children ?? ''}</article>`,
						canAttachAttributes: true,
						rootTag: 'article',
						integrationName: 'explicit-renderer',
						rootAttributes: { 'data-eco-component-id': 'root-node' },
					};
				}),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const parentMarker = createBoundaryMarker('n_2', 'parent-component', 'props-parent');
			const leafMarker = createBoundaryMarker('n_3', 'leaf-component', 'props-leaf');

			renderer.RenderedBody = `<html><body><main>${createBoundaryMarker('n_1', 'root-component', 'props-root')}</main></body></html>`;
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
			};

			const RootComponent = (() => '<article>Root</article>') as EcoComponent<Record<string, unknown>>;
			RootComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'root-component',
					file: '/app/components/root-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const ParentComponent = (() => '<section>Parent</section>') as EcoComponent<Record<string, unknown>>;
			ParentComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'parent-component',
					file: '/app/components/parent-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const LeafComponent = (() => '<span>Leaf</span>') as EcoComponent<Record<string, unknown>>;
			LeafComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'leaf-component',
					file: '/app/components/leaf-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [RootComponent, ParentComponent, LeafComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			} as unknown as EcoPageFile;
			renderer.RenderBodyFactory = () => renderer.RenderedBody;
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			await expect(
				renderer.execute({
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				}),
			).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
			expect(renderOrder).toEqual([]);
		});

		it('should fail route execution when props reference is missing', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async () => ({
					html: '<aside>Nested Render</aside>',
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'explicit-renderer',
				})),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody =
				'<html><body><main><eco-marker data-eco-node-id="n_1" data-eco-component-ref="nested-component" data-eco-props-ref="props-missing"></eco-marker></main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
			};

			const NestedComponent = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
			NestedComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'nested-component',
					file: '/app/components/nested-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [NestedComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			} as unknown as EcoPageFile;
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			await expect(
				renderer.execute({
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				}),
			).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
		});

		it('should not recursively resolve boundary artifacts that were only passed through resolved child html', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.MockComponentRenderResult = {
				html: '<section><eco-marker data-eco-node-id="n_2" data-eco-component-ref="nested-component" data-eco-props-ref="p_2"></eco-marker></section>',
				canAttachAttributes: true,
				rootTag: 'section',
				integrationName: 'test-renderer',
			};

			const Component = (() => '<section />') as EcoComponent<Record<string, unknown>>;
			Component.config = {
				integration: 'test-renderer',
				__eco: {
					id: 'component',
					file: '/app/components/component.ts',
					integration: 'test-renderer',
				},
			};

			await expect(
				renderer.renderComponentBoundary({
					component: Component,
					props: {},
					children: '<aside>already resolved child html</aside>',
				}),
			).resolves.toEqual(
				expect.objectContaining({
					html: '<section><eco-marker data-eco-node-id="n_2" data-eco-component-ref="nested-component" data-eco-props-ref="p_2"></eco-marker></section>',
				}),
			);
		});

		it('fails fast when a renderer without a boundary runtime crosses into a foreign owner', async () => {
			const foreignRenderer = {
				renderComponent: vi.fn(async () => ({
					html: '<span>resolved nested marker</span>',
					canAttachAttributes: true,
					rootTag: 'span',
					integrationName: 'foreign-renderer',
				})),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					foreignRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'foreign-renderer',
						initializeRenderer: () => foreignRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const ForeignComponent = eco.component<{}, string>({
				integration: 'foreign-renderer',
				render: () => '<span>foreign</span>',
			});

			const ShellComponent = eco.component<{ children?: string }, string>({
				integration: 'test-renderer',
				dependencies: {
					components: [ForeignComponent],
				},
				render: ({ children }) => `<section>${children ?? ''}${ForeignComponent({})}</section>`,
			});

			const passedThroughMarker = createBoundaryMarker('n_passed', 'passed-through-component', 'p_passed');

			await expect(
				renderer.renderComponentBoundary({
					component: ShellComponent,
					props: { children: passedThroughMarker },
					children: passedThroughMarker,
				}),
			).rejects.toThrow('without a renderer-owned boundary runtime');
			expect(foreignRenderer.renderComponent).toHaveBeenCalledTimes(0);
		});

		it('fails route execution when deep mixed-integration boundary artifacts are returned at the route level', async () => {
			const renderOrder: string[] = [];
			const explicitRenderer = {
				renderComponent: vi.fn(async (input: ComponentRenderInput) => {
					const componentId = input.component.config?.__eco?.id as string | undefined;
					if (componentId) {
						renderOrder.push(componentId);
					}

					if (componentId === 'leaf-component') {
						return {
							html: '<span data-leaf="true">Leaf Render</span>',
							canAttachAttributes: true,
							rootTag: 'span',
							integrationName: 'explicit-renderer',
						};
					}

					if (componentId === 'parent-component') {
						return {
							html: `<section data-parent="true">${input.children ?? ''}</section>`,
							canAttachAttributes: true,
							rootTag: 'section',
							integrationName: 'explicit-renderer',
						};
					}

					return {
						html: `<article data-root="true">${input.children ?? ''}</article>`,
						canAttachAttributes: true,
						rootTag: 'article',
						integrationName: 'explicit-renderer',
					};
				}),
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			} as unknown as IntegrationRenderer;

			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const parentMarker = createBoundaryMarker('n_2', 'parent-component', 'props-parent');
			const leafMarker = createBoundaryMarker('n_3', 'leaf-component', 'props-leaf');

			renderer.RenderedBody = `<html><body><main><div data-shell="deep">${createBoundaryMarker('n_1', 'root-component', 'props-root')}</div></main></body></html>`;
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'test-renderer',
			};

			const RootComponent = (() => '<article>Root</article>') as EcoComponent<Record<string, unknown>>;
			RootComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'root-component',
					file: '/app/components/root-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const ParentComponent = (() => '<section>Parent</section>') as EcoComponent<Record<string, unknown>>;
			ParentComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'parent-component',
					file: '/app/components/parent-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const LeafComponent = (() => '<span>Leaf</span>') as EcoComponent<Record<string, unknown>>;
			LeafComponent.config = {
				integration: 'explicit-renderer',
				__eco: {
					id: 'leaf-component',
					file: '/app/components/leaf-component.ts',
					integration: 'explicit-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [RootComponent, ParentComponent, LeafComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			} as unknown as EcoPageFile;
			renderer.RenderBodyFactory = () => renderer.RenderedBody;
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			await expect(
				renderer.execute({
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				}),
			).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
			expect(renderOrder).toEqual([]);
		});

		it('renders same-integration leaf components under their own integration context', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const LeafComponent = eco.component<{}, string>({
				integration: 'test-renderer',
				render: () => '<section>Leaf Render</section>',
			});

			const result = await runWithComponentRenderContext(
				{
					currentIntegration: 'foreign-renderer',
				},
				async () =>
					renderer.renderComponentBoundary({
						component: LeafComponent,
						props: {},
					}),
			);

			expect(result.value.html).toBe('<section>Leaf Render</section>');
			expect(result.value.html).not.toContain('<eco-marker');
			expect(renderer.BoundaryRuntimeCreationCount).toBe(0);
		});

		it('uses inline partial rendering when no foreign boundaries are present', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});
			const View = (() => '<section>Inline</section>') as EcoComponent<Record<string, unknown>>;
			View.config = {
				integration: 'test-renderer',
				__eco: {
					id: 'inline-view',
					file: '/app/components/inline-view.ts',
					integration: 'test-renderer',
				},
			};

			let inlineRenderCount = 0;
			const response = await renderer.testRenderPartialViewResponse({
				view: View,
				props: {},
				renderInline: async () => {
					inlineRenderCount += 1;
					return '<section>Inline</section>';
				},
			});

			expect(await response.text()).toBe('<section>Inline</section>');
			expect(inlineRenderCount).toBe(1);
			expect(renderer.BoundaryRenderCount).toBe(0);
		});

		it('falls back to boundary partial rendering when compatibility is needed', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});
			const ForeignChild = (() => '<span>Foreign</span>') as EcoComponent<Record<string, unknown>>;
			ForeignChild.config = {
				integration: 'react',
				__eco: {
					id: 'foreign-child',
					file: '/app/components/foreign-child.tsx',
					integration: 'react',
				},
			};

			const View = (() => '<section>Boundary</section>') as EcoComponent<Record<string, unknown>>;
			View.config = {
				integration: 'test-renderer',
				__eco: {
					id: 'boundary-view',
					file: '/app/components/boundary-view.ts',
					integration: 'test-renderer',
				},
				dependencies: { components: [ForeignChild] },
			};
			renderer.MockComponentRenderResult = {
				html: '<section>Boundary</section>',
				canAttachAttributes: true,
				rootTag: 'section',
				integrationName: 'test-renderer',
			};

			let inlineRenderCount = 0;
			const response = await renderer.testRenderPartialViewResponse({
				view: View,
				props: {},
				renderInline: async () => {
					inlineRenderCount += 1;
					return '<section>Inline</section>';
				},
			});

			expect(await response.text()).toBe('<section>Boundary</section>');
			expect(inlineRenderCount).toBe(0);
			expect(renderer.BoundaryRenderCount).toBe(1);
		});

		it('reuses one foreign renderer instance across shared view shell composition', async () => {
			const foreignRenderer = {
				renderComponentBoundary: vi.fn(async (input: ComponentRenderInput) => {
					const componentId = input.component.config?.__eco?.id;

					if (componentId === 'foreign-html-template') {
						return {
							html: `<html><body>${String(input.children ?? '')}</body></html>`,
							canAttachAttributes: true,
							rootTag: 'html',
							integrationName: 'foreign-renderer',
						};
					}

					if (componentId === 'foreign-layout') {
						return {
							html: `<main>${String(input.children ?? '')}</main>`,
							canAttachAttributes: true,
							rootTag: 'main',
							integrationName: 'foreign-renderer',
						};
					}

					return {
						html: '<section>Foreign View</section>',
						canAttachAttributes: true,
						rootTag: 'section',
						integrationName: 'foreign-renderer',
					};
				}),
			} as unknown as IntegrationRenderer;

			const initializeRenderer = vi.fn(() => foreignRenderer);
			const appConfig = {
				...AppConfig,
				integrations: [
					{
						name: 'foreign-renderer',
						initializeRenderer,
					},
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = (() => '<section>Foreign View</section>') as EcoComponent<Record<string, unknown>>;
			View.config = {
				integration: 'foreign-renderer',
				__eco: {
					id: 'foreign-view',
					file: '/app/components/foreign-view.ts',
					integration: 'foreign-renderer',
				},
			};

			const Layout = (() => '<main />') as EcoComponent<Record<string, unknown>>;
			Layout.config = {
				integration: 'foreign-renderer',
				__eco: {
					id: 'foreign-layout',
					file: '/app/components/foreign-layout.ts',
					integration: 'foreign-renderer',
				},
			};

			renderer.HtmlTemplate = (() => '<html><body></body></html>') as EcoComponent<HtmlTemplateProps>;
			renderer.HtmlTemplate.config = {
				integration: 'foreign-renderer',
				__eco: {
					id: 'foreign-html-template',
					file: '/app/components/foreign-html-template.ts',
					integration: 'foreign-renderer',
				},
			};

			const response = await renderer.testRenderViewWithDocumentShell({
				view: View,
				props: {},
				layout: Layout,
			});

			expect(await response.text()).toContain('<main><section>Foreign View</section></main>');
			expect(initializeRenderer).toHaveBeenCalledTimes(1);
			expect(foreignRenderer.renderComponentBoundary).toHaveBeenCalledTimes(3);
		});

		it('should skip foreign-boundary wrapping for pure same-integration component trees', () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const Child = (() => '<span>Child</span>') as EcoComponent<Record<string, unknown>>;
			Child.config = {
				integration: 'test-renderer',
				__eco: {
					id: 'child-component',
					file: '/app/components/child-component.ts',
					integration: 'test-renderer',
				},
			};

			const Root = (() => '<section>Root</section>') as EcoComponent<Record<string, unknown>>;
			Root.config = {
				integration: 'test-renderer',
				__eco: {
					id: 'root-component',
					file: '/app/components/root-component.ts',
					integration: 'test-renderer',
				},
				dependencies: { components: [Child] },
			};

			expect(renderer.testHasForeignBoundaryDescendants(Root)).toBe(false);
		});

		it('should detect nested cross-integration component trees', () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: AppConfig,
				assetProcessingService: AssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const ForeignChild = (() => '<span>Child</span>') as EcoComponent<Record<string, unknown>>;
			ForeignChild.config = {
				integration: 'react',
				__eco: {
					id: 'foreign-child-component',
					file: '/app/components/foreign-child-component.tsx',
					integration: 'react',
				},
			};

			const Root = (() => '<section>Root</section>') as EcoComponent<Record<string, unknown>>;
			Root.config = {
				integration: 'test-renderer',
				__eco: {
					id: 'root-component',
					file: '/app/components/root-component.ts',
					integration: 'test-renderer',
				},
				dependencies: { components: [ForeignChild] },
			};

			expect(renderer.testHasForeignBoundaryDescendants(Root)).toBe(true);
		});
	});
});
