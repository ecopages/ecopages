import { describe, expect, it, vi } from 'vitest';
import type {
	ForeignSubtreeRenderPayload,
	EcoComponent,
	EcoPageFile,
	EcoPagesElement,
	HtmlTemplateProps,
	ProcessedAsset,
} from '@ecopages/core';
import { eco } from '@ecopages/core';
import {
	createDeferredIntegrationPlugin,
	createTestAppConfig,
	htmlDocumentHead,
	renderFilesystemPageAndExplicitView,
} from '@ecopages/testing';
import { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import type { PageBrowserGraphContributionContext } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { toForeignSubtreeRenderPayload } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import { MDXRenderer } from '../mdx-renderer.ts';

const Config = await createTestAppConfig();

function createTestAssetProcessingService(appConfig: typeof Config): AssetProcessingService {
	const service = new AssetProcessingService(appConfig);
	vi.spyOn(service, 'processDependencies').mockResolvedValue([]);
	return service;
}

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
		assetProcessingService: createTestAssetProcessingService(Config),
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
};

const renderer = new MDXRenderer({
	appConfig: Config,
	assetProcessingService: createTestAssetProcessingService(Config),
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

class ImportTestMdxRenderer extends MDXRenderer {
	public normalizeForTest(module: Parameters<MDXRenderer['normalizeImportedPageFile']>[1]) {
		return this.normalizeImportedPageFile('/tmp/page.mdx', module as never);
	}
}

class BrowserGraphTestMdxRenderer extends MDXRenderer {
	public resolvedComponents: Array<EcoComponent | Partial<EcoComponent>> = [];

	public collectForTest(context: PageBrowserGraphContributionContext) {
		return this.collectPageBrowserGraphContribution(context);
	}

	protected override async resolveDependencies(
		components: Array<EcoComponent | Partial<EcoComponent>>,
	): Promise<ProcessedAsset[]> {
		this.resolvedComponents = components;
		return [];
	}
}

describe('MDXRenderer', () => {
	describe('page importing', () => {
		it('normalizes imported MDX modules without overriding the base import path', () => {
			const testRenderer = new ImportTestMdxRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			const Layout = (async ({ children }: { children: EcoPagesElement }) => children) as EcoComponent<{
				children: EcoPagesElement;
			}>;
			const Page = (async () => '<article>content</article>') as unknown as EcoComponent;
			const config = { layouts: [Layout] } as never;

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

	describe('page browser graph contribution', () => {
		it('preserves page and imported MDX layout identities in dependency collection', async () => {
			const renderer = new BrowserGraphTestMdxRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			const Layout = (async ({ children }: { children: EcoPagesElement }) => children) as EcoComponent<{
				children: EcoPagesElement;
			}>;
			Layout.config = {
				identity: { id: 'imported-mdx-layout', file: '/app/layouts/site.mdx', integration: 'mdx' },
				dependencies: { scripts: ['./site.client.js'] },
			};
			const Page = (async () => '<article>content</article>') as unknown as EcoComponent;
			const pageConfig = {
				identity: { id: 'existing-page-identity', file: '/app/pages/original.mdx', integration: 'mdx' },
				dependencies: { scripts: ['./page.client.js'] },
				layouts: [Layout],
			};
			Page.config = pageConfig;

			await renderer.collectForTest({
				file: '/app/pages/post.mdx',
				pageModule: { default: Page, config: pageConfig } as EcoPageFile,
			});

			expect(renderer.resolvedComponents.map((component) => component.config?.identity)).toEqual([
				{ id: 'imported-mdx-layout', file: '/app/layouts/site.mdx', integration: 'mdx' },
				{ id: 'existing-page-identity', file: '/app/pages/post.mdx', integration: 'mdx' },
			]);
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
			const config = await createTestAppConfig({
				integrations: [
					createDeferredIntegrationPlugin({
						extensions: ['.deferred.ts'],
					}),
				],
			});
			const renderer = new TestMdxRenderer({
				appConfig: config,
				assetProcessingService: createTestAssetProcessingService(config),
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

		it('should expose the compatibility foreign-subtree payload contract', async () => {
			const testRenderer = createRenderer();
			const Component = (async () => '<article>Foreign Subtree</article>') as unknown as EcoComponent<object>;

			const result = toForeignSubtreeRenderPayload(
				await testRenderer.renderComponentWithForeignChildren({
					component: Component,
					props: {},
				}),
			);

			expect(result).toEqual<ForeignSubtreeRenderPayload>({
				html: '<article>Foreign Subtree</article>',
				assets: [],
				rootTag: 'article',
				rootAttributes: undefined,
				attachmentPolicy: { kind: 'first-element' },
				integrationName: 'MDX',
			});
		});
	});

	describe('renderExplicitView', () => {
		it('should render a view with default status 200', async () => {
			const testRenderer = createRenderer();
			const View = (async (props: { title: string }) => `<h1>${props.title}</h1>`) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderExplicitView(View, { title: 'Hello MDX' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello MDX</h1>');
		});

		it('should render a partial view without layout', async () => {
			const testRenderer = createRenderer();
			const View = (async (props: { content: string }) =>
				`<div>${props.content}</div>`) as unknown as EcoComponent<{ content: string }>;

			const response = await testRenderer.renderExplicitView(View, { content: 'Partial MDX' }, { partial: true });

			const body = await response.text();
			expect(body).toBe('<div>Partial MDX</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Not Found</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderExplicitView(View, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Cached</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderExplicitView(
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
			View.config = { layouts: [Layout] };

			const response = await testRenderer.renderExplicitView(View, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('matches the filesystem page head and layouts', async () => {
			const testRenderer = createRenderer();
			testRenderer.htmlTemplate = (async ({ children, metadata }) =>
				`<html><head><title>${metadata.title}</title></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;
			const Layout = (async (props: { children: EcoPagesElement }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: EcoPagesElement }>;
			const View = (async (props: { message: string }) => `<p>${props.message}</p>`) as unknown as EcoComponent<{
				message: string;
			}>;
			View.metadata = (async () => ({
				title: 'About title',
				description: 'About',
			})) as unknown as EcoComponent['metadata'];
			View.config = { layouts: [Layout] };

			const { pageHtml, explicitHtml } = await renderFilesystemPageAndExplicitView(
				testRenderer,
				View,
				{ message: 'With Layout' },
				'/app/pages/about.mdx',
			);

			expect(htmlDocumentHead(explicitHtml)).toContain('About title');
			expect(htmlDocumentHead(explicitHtml)).toBe(htmlDocumentHead(pageHtml));
			expect(explicitHtml).toContain('<main class="layout">');
			expect(explicitHtml).toBe(pageHtml);
		});

		it('should throw an error if the view fails to render', async () => {
			const testRenderer = createRenderer();
			const View = (async () => {
				throw new Error('View failed to render');
			}) as unknown as EcoComponent<object>;

			await expect(testRenderer.renderExplicitView(View, {}, {})).rejects.toThrow(
				'Error rendering page: View failed to render',
			);
		});
	});
});
