import { describe, it, expect, vi } from 'vitest';
import { IntegrationRenderer, type RenderToResponseContext } from './integration-renderer.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../services/asset-processing-service/index.ts';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	RouteRendererBody,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	EcoPageFile,
	RouteRendererOptions,
	EcoComponent,
	HtmlTemplateProps,
} from '../public-types.ts';
import type { EcoPageComponent } from '../eco/eco.types.ts';

/**
 * Concrete implementation with ed file loading for testing purposes.
 */
class TestIntegrationRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test-renderer';

	/** Mock data container for page module */
	PageModule: EcoPageFile | null = null;
	/** Mock HTML template container */
	HtmlTemplate: EcoComponent<HtmlTemplateProps> | null = null;
	RenderedBody: RouteRendererBody = '<html><body>Test Page</body></html>';
	MockComponentRenderResult: ComponentRenderResult | null = null;

	async render(_options: IntegrationRendererRenderOptions<EcoPagesElement>): Promise<RouteRendererBody> {
		return this.RenderedBody;
	}

	override async renderComponent(_input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (this.MockComponentRenderResult) {
			return this.MockComponentRenderResult;
		}

		return super.renderComponent(_input);
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
			renderer.HtmlTemplate = (() => '<html><body><main>Stream Body</main></body></html>') as EcoComponent<
				HtmlTemplateProps
			>;

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
			renderer.HtmlTemplate = (() => '<html><body><main>Test Page</main></body></html>') as EcoComponent<
				HtmlTemplateProps
			>;

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
			renderer.HtmlTemplate = (() => '<html><body><main>Test Page</main></body></html>') as EcoComponent<
				HtmlTemplateProps
			>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			expect((explicitRenderer.renderComponent as any).mock.calls).toHaveLength(0);

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main data-eco-component-id="eco-page-root">Test Page</main>');

			const processedDeps = (renderer as any).htmlTransformer.getProcessedDependencies();
			expect(processedDeps.some((dep: ProcessedAsset) => dep.srcUrl === '/assets/nested-explicit.js')).toBe(false);
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
			renderer.HtmlTemplate = (() => '<html><body><main>Test Page</main></body></html>') as EcoComponent<
				HtmlTemplateProps
			>;

			await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const processedDeps = (renderer as any).htmlTransformer.getProcessedDependencies();
			expect(processedDeps.filter((dep: ProcessedAsset) => dep.srcUrl === '/assets/react-runtime.js')).toHaveLength(1);
		});

		it('should resolve eco-marker nodes via integration renderComponent with referenced props', async () => {
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
				'<html><body><main>Before<eco-marker data-eco-node-id="n_1" data-eco-integration="explicit-renderer" data-eco-component-ref="nested-component" data-eco-props-ref="props-1"></eco-marker>After</main></body></html>';
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
				componentGraphContext: {
					propsByRef: {
						'props-1': { count: 3 },
					},
				},
			} as unknown as EcoPageFile;
			renderer.HtmlTemplate = (() => '<html><body><main>Test Page</main></body></html>') as EcoComponent<
				HtmlTemplateProps
			>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<aside data-eco-component-id="nested-1">Nested Render</aside>');
			expect(body).not.toContain('<eco-marker');
			expect((explicitRenderer.renderComponent as any).mock.calls).toHaveLength(1);
			expect((explicitRenderer.renderComponent as any).mock.calls[0][0].props).toEqual({ count: 3 });

			const processedDeps = (renderer as any).htmlTransformer.getProcessedDependencies();
			expect(processedDeps.some((dep: ProcessedAsset) => dep.srcUrl === '/assets/nested-render.js')).toBe(true);
		});

		it('should fail marker resolution when props reference is missing', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async () => ({
					html: '<aside>Nested Render</aside>',
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'explicit-renderer',
				})),
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
				'<html><body><main><eco-marker data-eco-node-id="n_1" data-eco-integration="explicit-renderer" data-eco-component-ref="nested-component" data-eco-props-ref="props-missing"></eco-marker></main></body></html>';
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
				componentGraphContext: {
					propsByRef: {},
				},
			} as unknown as EcoPageFile;
			renderer.HtmlTemplate = (() => '<html><body><main>Test Page</main></body></html>') as EcoComponent<
				HtmlTemplateProps
			>;

			await expect(
				renderer.execute({
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				}),
			).rejects.toThrow('Missing props reference for marker: props-missing');
		});
	});
});
