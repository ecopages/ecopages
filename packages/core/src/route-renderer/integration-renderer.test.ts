import { describe, it, expect, mock } from 'bun:test';
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
 * Concrete implementation with mocked file loading for testing purposes.
 */
class TestIntegrationRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test-renderer';

	/** Mock data container for page module */
	mockPageModule: EcoPageFile | null = null;
	/** Mock HTML template container */
	mockHtmlTemplate: EcoComponent<HtmlTemplateProps> | null = null;

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
	 * Override protected methods to return mock data.
	 */
	protected override async importPageFile(_file: string): Promise<EcoPageFile> {
		if (!this.mockPageModule) throw new Error('Mock page module not set');
		return this.mockPageModule;
	}

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		if (!this.mockHtmlTemplate) throw new Error('Mock HTML template not set');
		return this.mockHtmlTemplate;
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
}

describe('IntegrationRenderer', () => {
	const mockAppConfig = {
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

	const mockAssetService = {
		processDependencies: mock(() => Promise.resolve([])),
	} as unknown as AssetProcessingService;

	it('should extract cache strategy from page component (static property)', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: mockAppConfig,
			assetProcessingService: mockAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		/** Mock page with cache strategy */
		const mockPageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		/** Simulate eco.page() attaching cache config */
		mockPageIdx.cache = { revalidate: 60 };

		renderer.mockPageModule = {
			default: mockPageIdx,
		};
		renderer.mockHtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

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
			appConfig: mockAppConfig,
			assetProcessingService: mockAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		/** Mock page without cache strategy */
		const mockPageIdx = (() => 'Page Content') as EcoPageComponent<any>;

		renderer.mockPageModule = {
			default: mockPageIdx,
		};
		renderer.mockHtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

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
			appConfig: mockAppConfig,
			assetProcessingService: mockAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const mockPageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		/** Attached static methods */
		mockPageIdx.staticProps = async () => ({ props: { title: 'Dynamic Title' } });
		mockPageIdx.metadata = async ({ props }: { props: Record<string, unknown> }) => ({
			title: props.title as string,
			description: 'Dynamic Description',
		});

		renderer.mockPageModule = {
			default: mockPageIdx,
		};
		renderer.mockHtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/props-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.props).toEqual({ title: 'Dynamic Title' });
		expect(result.metadata?.title).toBe('Dynamic Title');
	});

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: mockAppConfig,
				assetProcessingService: mockAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const mockView = ((props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{
				title: string;
			}>;

			const response = await renderer.renderToResponse(mockView, { title: 'Hello' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello</h1>');
		});

		it('should render a partial view without layout', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: mockAppConfig,
				assetProcessingService: mockAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const mockView = ((props: { content: string }) => `<div>${props.content}</div>`) as EcoComponent<{
				content: string;
			}>;

			const response = await renderer.renderToResponse(mockView, { content: 'Partial' }, { partial: true });

			const body = await response.text();
			expect(body).toBe('<div>Partial</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: mockAppConfig,
				assetProcessingService: mockAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const mockView = (() => '<p>Not Found</p>') as EcoComponent<object>;

			const response = await renderer.renderToResponse(mockView, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: mockAppConfig,
				assetProcessingService: mockAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const mockView = (() => '<p>Cached</p>') as EcoComponent<object>;

			const response = await renderer.renderToResponse(
				mockView,
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
				appConfig: mockAppConfig,
				assetProcessingService: mockAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const mockLayout = ((props: { children: string }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: string }>;

			const mockView = ((props: { message: string }) => `<p>${props.message}</p>`) as EcoComponent<{
				message: string;
			}>;
			mockView.config = { layout: mockLayout };

			const response = await renderer.renderToResponse(mockView, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});
	});
});
