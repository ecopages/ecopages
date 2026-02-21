import { describe, it, expect, vi } from 'vitest';
import { IntegrationRenderer, type RenderToResponseContext } from './integration-renderer.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../services/asset-processing-service/index.ts';
import type {
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

	async render(_options: IntegrationRendererRenderOptions<EcoPagesElement>): Promise<RouteRendererBody> {
		return '<html><body>Test Page</body></html>';
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

	it('should prefer processed lazy script srcUrl for _resolvedScripts', async () => {
		let capturedDeps: unknown[] = [];
		const LazySrcUrl = '/assets/_hmr/components/lit-counter/lit-counter.script.js';
		const Service = {
			processDependencies: vi.fn(async (deps: unknown[]) => {
				capturedDeps = deps;
				return [
					{
						kind: 'script',
						filepath: '/app/components/lit-counter/lit-counter.script.ts',
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
				lazy: {
					'on:interaction': 'click,mouseenter,focusin',
					scripts: ['./lit-counter.script.ts'],
				},
			},
		};

		await renderer.testProcessComponentDependencies([component]);

		expect(component.config._resolvedScripts).toBe(LazySrcUrl);
		expect(
			capturedDeps.some((dep) => {
				if (!dep || typeof dep !== 'object') return false;
				const candidate = dep as { source?: string; importPath?: string };
				return candidate.source === 'node-module' && candidate.importPath === '@ecopages/scripts-injector';
			}),
		).toBe(true);
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
				lazy: {
					'on:interaction': 'click,mouseenter,focusin',
					scripts: ['./lit-counter.script.ts'],
				},
			},
		};

		await renderer.testProcessComponentDependencies([component]);

		expect(component.config._resolvedScripts).toBe('/assets/components/lit-counter/lit-counter.script.js');
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
});
