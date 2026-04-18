import { describe, expect, it, vi } from 'vitest';
import type {
	BoundaryRenderPayload,
	EcoComponent,
	EcoPageFile,
	HtmlTemplateProps,
	EcoPagesElement,
} from '@ecopages/core';
import { eco } from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { MDXRenderer } from '../mdx-renderer.ts';

const Config = await new ConfigBuilder()
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

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class TestMdxRenderer extends MDXRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}
}

const createRenderer = () => {
	return new TestMdxRenderer({
		appConfig: Config,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
};

const renderer = new MDXRenderer({
	appConfig: Config,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

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
			extensions: ['.deferred.ts'],
		});
	}
}

class ImportTestMdxRenderer extends MDXRenderer {
	public normalizeForTest(module: Parameters<MDXRenderer['normalizeImportedPageFile']>[1]) {
		return this.normalizeImportedPageFile('/tmp/page.mdx', module as never);
	}
}

describe('MDXRenderer', () => {
	describe('page importing', () => {
		it('normalizes imported MDX modules without overriding the base import path', () => {
			const testRenderer = new ImportTestMdxRenderer({
				appConfig: Config,
				assetProcessingService: {} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			const Layout = (async ({ children }: { children: EcoPagesElement }) => children) as EcoComponent<{
				children: EcoPagesElement;
			}>;
			const Page = (async () => '<article>content</article>') as unknown as EcoComponent;
			const config = { layout: Layout } as never;

			const result = testRenderer.normalizeForTest({
				default: Page,
				config,
				getMetadata: async () => ({
					title: 'Hello',
					description: 'Hello',
				}),
			} as never) as EcoPageFile & { layout?: unknown };

			expect(result.default).toBe(Page);
			expect(result.layout).toBe(Layout);
			expect((result.default as typeof Page).config).toBe(config);
		});
	});

	describe('render', () => {
		it('should render the page', async () => {
			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<article>MDX Content</article>',
				HtmlTemplate,
			});

			expect(body).toContain('<!DOCTYPE html>');
			expect(body).toContain('<article>MDX Content</article>');
		});

		it('should render the page with layout', async () => {
			const Layout: EcoComponent<{ children: EcoPagesElement }> = async ({ children }) =>
				`<main class="mdx-layout">${children}</main>`;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<article>MDX Content</article>',
				Layout,
				HtmlTemplate,
			});

			expect(body).toContain('<main class="mdx-layout">');
			expect(body).toContain('<article>MDX Content</article>');
		});

		it('renders deferred foreign layout content through explicit component boundaries', async () => {
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([new DeferredPlugin()])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();
			const renderer = new TestMdxRenderer({
				appConfig: config,
				assetProcessingService: {} as any,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredWidget = eco.component<{}, string>({
				integration: 'deferred',
				render: () => '<button>fallback</button>',
			});
			const Layout = eco.layout<string>({
				dependencies: {
					components: [DeferredWidget],
				},
				render: ({ children }) => `<main class="mdx-layout">${children}${String(DeferredWidget({}))}</main>`,
			});

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<article>MDX Content</article>',
				Layout,
				HtmlTemplate,
				pageProps: {},
			});

			expect(body).toContain('data-testid="deferred-widget"');
			expect(body).not.toContain('<eco-marker');
		});

		it('should throw an error if the page fails to render', async () => {
			await expect(
				renderer.render({
					params: {},
					query: {},
					props: {},
					file: 'file',
					resolvedDependencies: [],
					metadata: {
						title: 'Hello World',
						description: 'Hello World',
					},
					Page: async () => {
						throw new Error('Page failed to render');
					},
					HtmlTemplate,
				}),
			).rejects.toThrow('Error rendering page: Page failed to render');
		});

		it('should expose the compatibility boundary payload contract', async () => {
			const testRenderer = createRenderer();
			const Component = (async () => '<article>Boundary</article>') as unknown as EcoComponent<object>;

			const result = await testRenderer.renderBoundary({
				component: Component,
				props: {},
			});

			expect(result).toEqual<BoundaryRenderPayload>({
				html: '<article>Boundary</article>',
				assets: [],
				rootTag: 'article',
				rootAttributes: undefined,
				attachmentPolicy: { kind: 'first-element' },
				integrationName: 'MDX',
			});
		});
	});

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const testRenderer = createRenderer();
			const View = (async (props: { title: string }) => `<h1>${props.title}</h1>`) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderToResponse(View, { title: 'Hello MDX' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello MDX</h1>');
		});

		it('should render a partial view without layout', async () => {
			const testRenderer = createRenderer();
			const View = (async (props: { content: string }) =>
				`<div>${props.content}</div>`) as unknown as EcoComponent<{ content: string }>;

			const response = await testRenderer.renderToResponse(View, { content: 'Partial MDX' }, { partial: true });

			const body = await response.text();
			expect(body).toBe('<div>Partial MDX</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Not Found</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(View, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Cached</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(
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
			const testRenderer = createRenderer();
			const Layout = (async (props: { children: EcoPagesElement }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: EcoPagesElement }>;

			const View = (async (props: { message: string }) => `<p>${props.message}</p>`) as unknown as EcoComponent<{
				message: string;
			}>;
			View.config = { layout: Layout };

			const response = await testRenderer.renderToResponse(View, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('should throw an error if the view fails to render', async () => {
			const testRenderer = createRenderer();
			const View = (async () => {
				throw new Error('View failed to render');
			}) as unknown as EcoComponent<object>;

			await expect(testRenderer.renderToResponse(View, {}, {})).rejects.toThrow(
				'Error rendering view: View failed to render',
			);
		});
	});
});
