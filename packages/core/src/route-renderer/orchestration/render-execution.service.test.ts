import { describe, expect, it, vi } from 'vitest';
import { getComponentRenderContext } from './component-render-context.ts';
import type {
	EcoComponent,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	RouteRendererOptions,
} from '../../types/public-types.ts';
import { RenderExecutionService } from './render-execution.service.ts';

describe('RenderExecutionService', () => {
	it('captures streamed render bodies before final HTML handling', async () => {
		const service = new RenderExecutionService();
		const encoder = new TextEncoder();

		const result = await service.captureHtmlRender(
			async () =>
				new ReadableStream({
					start(controller) {
						controller.enqueue(encoder.encode('<html><body><main>Streamed</main></body></html>'));
						controller.close();
					},
				}) as unknown as BodyInit,
		);

		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(result.html).toContain('<main>Streamed</main>');
	});

	it('preserves streamed bodies when no marker resolution or attribute stamping is required', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		const encoder = new TextEncoder();

		const result = await service.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			{
				prepareRenderOptions: async () =>
					({
						HtmlTemplate,
						Page,
						cacheStrategy: { revalidate: 60 },
					}) as unknown as IntegrationRendererRenderOptions<unknown>,
				render: async () =>
					new ReadableStream({
						start(controller) {
							controller.enqueue(encoder.encode('<html><body><main>Streamed</main></body></html>'));
							controller.close();
						},
					}) as unknown as BodyInit,
				getDocumentAttributes: () => undefined,
				applyAttributesToHtmlElement: (html) => html,
				applyAttributesToFirstBodyElement: (html) => html,
				transformResponse: async (response) => response.body as RouteRendererBody,
			},
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(await new Response(result.body as BodyInit).text()).toContain('<main>Streamed</main>');
	});

	it('applies root and document attributes to fully resolved route HTML', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		const result = await service.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			{
				prepareRenderOptions: async () =>
					({
						HtmlTemplate,
						Page,
						cacheStrategy: { revalidate: 60 },
						componentRender: {
							canAttachAttributes: true,
							rootAttributes: { 'data-eco-component-id': 'eco-page-root' },
						},
					}) as unknown as IntegrationRendererRenderOptions<unknown>,
				render: async () => '<html><body><main>Resolved</main></body></html>',
				getDocumentAttributes: () => ({ 'data-eco-document-owner': 'react-router' }),
				applyAttributesToHtmlElement: (html, attributes) =>
					html.replace('<html', `<html data-eco-document-owner="${attributes['data-eco-document-owner']}"`),
				applyAttributesToFirstBodyElement: (html, attributes) =>
					html.replace('<main', `<main data-eco-component-id="${attributes['data-eco-component-id']}"`),
				transformResponse: async (response) => await response.text(),
			},
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toContain('<html data-eco-document-owner="react-router"><body>');
		expect(result.body).toContain('<main data-eco-component-id="eco-page-root">Resolved</main>');
	});

	it('throws when route HTML contains unresolved markers', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			service.execute(
				{
					file: '/app/pages/index.tsx',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				{
					prepareRenderOptions: async () =>
						({
							HtmlTemplate,
							Page,
							cacheStrategy: 'dynamic',
						}) as unknown as IntegrationRendererRenderOptions<unknown>,
					render: async () =>
						'<html><body>&amp;lt;eco-marker data-eco-node-id=&quot;n_2&quot; data-eco-component-ref=&quot;page-component&quot; data-eco-props-ref=&quot;p_2&quot;&amp;gt;&amp;lt;/eco-marker&amp;gt;</body></html>',
					getDocumentAttributes: () => undefined,
					applyAttributesToHtmlElement: (html) => html,
					applyAttributesToFirstBodyElement: (html) => html,
					transformResponse: async (response) => await response.text(),
				},
			),
		).rejects.toThrow('Full-route marker fallback has been removed');
	});

	it('renders routes with no active component render context', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		const result = await service.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			{
				prepareRenderOptions: async () =>
					({
						HtmlTemplate,
						Page,
						cacheStrategy: 'dynamic',
					}) as unknown as IntegrationRendererRenderOptions<unknown>,
				render: async () => {
					expect(getComponentRenderContext()).toBeUndefined();
					return '<html><body><main>Plain render</main></body></html>';
				},
				getDocumentAttributes: () => undefined,
				applyAttributesToHtmlElement: (html) => html,
				applyAttributesToFirstBodyElement: (html) => html,
				transformResponse: async (response) => await response.text(),
			},
		);

		expect(result.body).toContain('<main>Plain render</main>');
	});

	it('throws when route HTML returns unresolved marker tokens', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			service.execute(
				{
					file: '/app/pages/index.tsx',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				{
					prepareRenderOptions: async () =>
						({
							HtmlTemplate,
							Page,
							cacheStrategy: 'dynamic',
						}) as unknown as IntegrationRendererRenderOptions<unknown>,
						render: async () =>
							'<html><body><eco-marker data-eco-node-id="n_1" data-eco-component-ref="unexpected-marker" data-eco-props-ref="p_1"></eco-marker></body></html>',
					getDocumentAttributes: () => undefined,
					applyAttributesToHtmlElement: (html) => html,
					applyAttributesToFirstBodyElement: (html) => html,
					transformResponse: async (response) => await response.text(),
				},
			),
		).rejects.toThrow('Full-route marker fallback has been removed');
	});
});
