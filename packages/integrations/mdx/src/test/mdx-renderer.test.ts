import { describe, expect, it, spyOn } from 'bun:test';
import type { EcoComponent, HtmlTemplateProps, EcoPagesElement } from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { MDXRenderer } from '../mdx-renderer.ts';

const mockConfig = await new ConfigBuilder()
	.setIncludesTemplates({
		head: 'head.ts',
		html: 'html.ts',
		seo: 'seo.ts',
	})
	.setError404Template('404.ts')
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

const createRenderer = () => {
	const renderer = new MDXRenderer({
		appConfig: mockConfig,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
	spyOn(renderer as any, 'getHtmlTemplate').mockResolvedValue(HtmlTemplate);
	return renderer;
};

const renderer = new MDXRenderer({
	appConfig: mockConfig,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

describe('MDXRenderer', () => {
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
	});

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const testRenderer = createRenderer();
			const mockView = (async (props: { title: string }) =>
				`<h1>${props.title}</h1>`) as unknown as EcoComponent<{ title: string }>;

			const response = await testRenderer.renderToResponse(mockView, { title: 'Hello MDX' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello MDX</h1>');
		});

		it('should render a partial view without layout', async () => {
			const testRenderer = createRenderer();
			const mockView = (async (props: { content: string }) =>
				`<div>${props.content}</div>`) as unknown as EcoComponent<{ content: string }>;

			const response = await testRenderer.renderToResponse(
				mockView,
				{ content: 'Partial MDX' },
				{ partial: true },
			);

			const body = await response.text();
			expect(body).toBe('<div>Partial MDX</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const testRenderer = createRenderer();
			const mockView = (async () => '<p>Not Found</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(mockView, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const testRenderer = createRenderer();
			const mockView = (async () => '<p>Cached</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(
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
			const testRenderer = createRenderer();
			const mockLayout = (async (props: { children: EcoPagesElement }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: EcoPagesElement }>;

			const mockView = (async (props: { message: string }) =>
				`<p>${props.message}</p>`) as unknown as EcoComponent<{ message: string }>;
			mockView.config = { layout: mockLayout };

			const response = await testRenderer.renderToResponse(mockView, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('should throw an error if the view fails to render', async () => {
			const testRenderer = createRenderer();
			const mockView = (async () => {
				throw new Error('View failed to render');
			}) as unknown as EcoComponent<object>;

			await expect(testRenderer.renderToResponse(mockView, {}, {})).rejects.toThrow(
				'Error rendering view: View failed to render',
			);
		});
	});
});
