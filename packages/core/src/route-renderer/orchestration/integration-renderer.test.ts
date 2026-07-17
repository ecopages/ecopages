import { describe, it, expect, vi } from 'vitest';
import { createPagePackage } from '../../services/assets/asset-processing-service/index.ts';
import { IntegrationRenderer } from './integration-renderer.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	ComponentRenderInput,
	EcoPagesElement,
	EcoPageFile,
	RouteRendererBody,
	RouteRendererOptions,
	EcoComponent,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
} from '../../types/public-types.ts';
import type { EcoPageComponent } from '../../eco/eco.types.ts';
import {
	TestIntegrationRenderer,
	createMockIntegrationPlugin,
	testAppConfig,
	testAssetService,
} from './integration-renderer.test-fixtures.ts';

describe('IntegrationRenderer', () => {
	it('serializes concurrent execute calls on one renderer instance', async () => {
		let active = 0;
		let maxActive = 0;
		const Page = (() => 'page') as EcoComponent;
		Page.config = {};
		const HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;

		const renderer = new (class extends TestIntegrationRenderer {
			override async render() {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await new Promise((resolve) => setTimeout(resolve, 10));
				active -= 1;
				return '<html><body>ok</body></html>';
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = HtmlTemplate;

		await Promise.all([
			renderer.execute({ file: '/app/pages/a.tsx', params: {}, query: {} }),
			renderer.execute({ file: '/app/pages/b.tsx', params: {}, query: {} }),
		]);

		expect(maxActive).toBe(1);
	});

	it('processes declarative page browser graph dependencies through shared route preparation', async () => {
		const processDependencies = vi.fn(async () => [{ kind: 'script', inline: false, srcUrl: '/page.js' }]);
		const renderer = new (class extends IntegrationRenderer<EcoPagesElement> {
			name = 'declarative-renderer';
			PageModule: EcoPageFile = { default: (() => 'Page') as EcoComponent };

			async render(): Promise<RouteRendererBody> {
				return '<html><body>Page</body></html>';
			}

			async renderToResponse(): Promise<Response> {
				return new Response('<html><body>Page</body></html>');
			}

			protected override async importPageFile(): Promise<EcoPageFile> {
				return this.PageModule;
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
			}

			protected override async collectPageBrowserGraphContribution(): Promise<PageBrowserGraphContribution> {
				return {
					dependencies: [
						{
							kind: 'script',
							source: 'content',
							content: 'console.log("page");',
							name: 'page',
							attributes: { type: 'module' },
						},
					],
				};
			}

			public async testPrepareRenderOptions(options: RouteRendererOptions) {
				return await super.prepareRenderOptions(options);
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: { processDependencies } as unknown as AssetProcessingService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const result = await renderer.testPrepareRenderOptions({ file: '/app/pages/test.tsx', params: {}, query: {} });

		expect(result.pagePackage).toEqual(
			expect.objectContaining({
				assets: expect.arrayContaining([{ kind: 'script', inline: false, srcUrl: '/page.js' }]),
				pageBrowserGraph: {
					entryAssets: [{ kind: 'script', inline: false, srcUrl: '/page.js' }],
					chunkAssets: [],
				},
			}),
		);
		expect(processDependencies).toHaveBeenCalledWith(
			[
				{
					kind: 'script',
					source: 'content',
					content: 'console.log("page");',
					name: 'page',
					attributes: { type: 'module' },
				},
			],
			'declarative-renderer:/app/pages/test.tsx',
		);
	});

	it('transformRouteResponse prefers renderer-owned page package updates over stale prepare-time package', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		const stalePagePackage = createPagePackage([]);
		const renderTimeAsset = {
			kind: 'script',
			inline: false,
			srcUrl: '/assets/scripts/render-time-hydration.js',
			position: 'head',
			attributes: { type: 'module' },
		} as ProcessedAsset;

		renderer.setTestPagePackage(stalePagePackage);
		renderer.appendTestProcessedDependencies([renderTimeAsset]);

		const body = await renderer.testTransformRouteResponse(
			new Response('<html><head></head><body></body></html>', {
				headers: { 'Content-Type': 'text/html' },
			}),
			[],
			stalePagePackage,
		);
		const html = typeof body === 'string' ? body : await new Response(body as BodyInit).text();

		expect(html).toContain('/assets/scripts/render-time-hydration.js');
	});

	it('should extract cache strategy from page component (static property)', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		PageIdx.cache = { revalidate: 60 };

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/cached-page.ts',
			params: {},
			query: {},
		});

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
	});

	it('should return undefined cache strategy if not present', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/simple-page.ts',
			params: {},
			query: {},
		});

		expect(result.cacheStrategy).toBeUndefined();
	});

	it('should resolve static props and metadata correctly', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		PageIdx.staticProps = async () => ({ props: { title: 'Dynamic Title' } });
		PageIdx.metadata = async ({ props }: { props: Record<string, unknown> }) => ({
			title: props.title as string,
			description: 'Dynamic Description',
		});

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.testPrepareRenderOptions({
			file: '/app/pages/props-page.ts',
			params: {},
			query: {},
		});

		expect(result.props).toEqual({ title: 'Dynamic Title' });
		expect(result.metadata?.title).toBe('Dynamic Title');
	});

	it('should prefer renderer module html template path when provided', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				runtime: {
					rendererModuleContext: {
						htmlTemplateModulePath: '/virtual/includes/html.kita.tsx',
					},
				},
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		renderer.PageModule = {
			default: (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>,
		};

		await renderer.testBaseGetHtmlTemplate();

		expect(renderer.ImportedFiles).toContain('/virtual/includes/html.kita.tsx');
	});

	it('should keep layout locals safe and page locals guarded on static pages', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
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
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
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

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const View = (() => '<p>Not Found</p>') as EcoComponent<object>;

			const response = await renderer.renderToResponse(View, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			const Layout = ((props: { children: string }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: string }>;

			const View = ((props: { message: string }) => `<p>${props.message}</p>`) as EcoComponent<{
				message: string;
			}>;
			View.config = { layouts: [Layout] };

			const response = await renderer.renderToResponse(View, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});
	});

	describe('renderComponent', () => {
		it('should render a component with structured output', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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

		it('should apply document attributes during route finalization', async () => {
			class DocumentAttributeRenderer extends TestIntegrationRenderer {
				protected override getDocumentAttributes(): Record<string, string> | undefined {
					return { 'data-eco-document-owner': 'react-router' };
				}
			}

			const renderer = new DocumentAttributeRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
				runtimeOrigin: 'http://localhost:3000',
			});

			renderer.RenderedBody = '<html><body><main>Test Page</main></body></html>';
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
			expect(body).toContain('<html data-eco-document-owner="react-router"><body>');
			expect(body).toContain('<main>Test Page</main>');
		});

		it('should not force render nested dependency components without resolved props context', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async (_input: ComponentRenderInput) => ({
					html: '<aside>Nested</aside>',
					canAttachAttributes: true,
					rootTag: 'aside',
					integrationName: 'explicit-renderer',
				})),
				renderComponentWithForeignChildren: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			};

			const appConfig = {
				...testAppConfig,
				integrations: [
					createMockIntegrationPlugin({
						name: 'explicit-renderer',
						initializeRenderer: () => explicitRenderer,
					}),
				],
			} as unknown as EcoPagesAppConfig;

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: testAssetService,
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

			expect(explicitRenderer.renderComponent).toHaveBeenCalledTimes(0);

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main>Test Page</main>');

			const processedDeps = renderer.getTestProcessedDependencies();
			expect(processedDeps.some((dep: ProcessedAsset) => dep.srcUrl === '/assets/nested-explicit.js')).toBe(
				false,
			);
		});

		it('should skip foreign-child wrapping for pure same-integration component trees', () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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

			expect(renderer.testHasForeignChildDescendants(Root)).toBe(false);
		});

		it('should detect nested cross-integration component trees', () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
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

			expect(renderer.testHasForeignChildDescendants(Root)).toBe(true);
		});
	});
});
