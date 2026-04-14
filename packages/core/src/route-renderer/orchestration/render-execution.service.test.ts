import { describe, expect, it, vi } from 'vitest';
import { getComponentRenderContext } from './component-render-context.ts';
import type {
	EcoComponent,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	RouteRendererOptions,
} from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import { createComponentMarker } from '../component-graph/component-marker.ts';
import { RenderExecutionService } from './render-execution.service.ts';

describe('RenderExecutionService', () => {
	it('captures streamed render bodies before the component render context exits', async () => {
		const service = new RenderExecutionService();
		const encoder = new TextEncoder();

		const result = await service.captureHtmlRender(
			'lit',
			{
				decideBoundaryRender: ({ targetIntegration }) => (targetIntegration === 'react' ? 'defer' : 'inline'),
			},
			undefined,
			async () => {
				const stream = new ReadableStream({
					start(controller) {
						const marker = createComponentMarker({
							nodeId: 'n_stream',
							integration: 'react',
							componentRef: 'streamed-component',
							propsRef: 'p_stream',
						});
						const context = getComponentRenderContext();
						if (context) {
							context.propsByRef.p_stream = { id: 'streamed-component' };
						}
						controller.enqueue(encoder.encode(`<html><body>${marker}</body></html>`));
						controller.close();
					},
				});

				return stream as unknown as BodyInit;
			},
		);

		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(result.html).toContain('data-eco-node-id="n_stream"');
		expect(result.graphContext.propsByRef).toEqual({
			p_stream: { id: 'streamed-component' },
		});
	});

	it('preserves streamed bodies when no marker resolution or attribute stamping is required', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		const encoder = new TextEncoder();
		const resolveMarkerGraphHtml = vi.fn();

		const result = await service.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			'react',
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
				getComponentRenderBoundaryContext: () => ({
					decideBoundaryRender: () => 'inline',
				}),
				getDocumentAttributes: () => undefined,
				resolveMarkerGraphHtml,
				dedupeProcessedAssets: (assets) => assets,
				getProcessedDependencies: () => [],
				setProcessedDependencies: vi.fn(),
				applyAttributesToHtmlElement: (html) => html,
				applyAttributesToFirstBodyElement: (html) => html,
				transformResponse: async (response) => response.body as RouteRendererBody,
			},
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(await new Response(result.body as BodyInit).text()).toContain('<main>Streamed</main>');
		expect(resolveMarkerGraphHtml).not.toHaveBeenCalled();
	});

	it('should execute render flow, merge graph context, resolve markers, and apply root attributes', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		const asset = { kind: 'script', srcUrl: '/assets/nested.js', position: 'head' } as ProcessedAsset;
		const setProcessedDependencies = vi.fn();
		const dedupeProcessedAssets = vi.fn((assets: ProcessedAsset[]) => {
			const seen = new Set<string>();
			return assets.filter((entry) => {
				const key = `${entry.kind}:${entry.srcUrl ?? ''}:${entry.position ?? ''}`;
				if (seen.has(key)) {
					return false;
				}
				seen.add(key);
				return true;
			});
		});
		const resolveMarkerGraphHtml = vi.fn(async (input) => {
			expect(input.componentsToResolve).toEqual([HtmlTemplate, Page]);
			expect(input.graphContext.propsByRef).toEqual({
				captured: { count: 1 },
				explicit: { count: 2 },
			});

			return {
				html: '<html><body><main>Resolved</main></body></html>',
				assets: [asset, asset],
			};
		});

		const result = await service.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			'ghtml',
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
						componentGraphContext: {
							propsByRef: {
								explicit: { count: 2 },
							},
						},
					}) as unknown as IntegrationRendererRenderOptions<unknown>,
				render: async () => {
					const context = getComponentRenderContext();
					if (context) {
						context.propsByRef.captured = { count: 1 };
					}
					return `<html><body>${createComponentMarker({
						nodeId: 'n_1',
						integration: 'react',
						componentRef: 'nested-component',
						propsRef: 'captured',
					})}</body></html>`;
				},
				getComponentRenderBoundaryContext: () => ({
					decideBoundaryRender: () => 'inline',
				}),
				getDocumentAttributes: () => ({ 'data-eco-document-owner': 'react-router' }),
				resolveMarkerGraphHtml,
				dedupeProcessedAssets,
				getProcessedDependencies: () => [asset],
				setProcessedDependencies,
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
		expect(setProcessedDependencies).toHaveBeenCalledWith([asset]);
		expect(dedupeProcessedAssets).toHaveBeenCalled();
		expect(resolveMarkerGraphHtml).toHaveBeenCalledTimes(1);
	});

	it('re-runs marker resolution when one pass surfaces another marker', async () => {
		const service = new RenderExecutionService();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<Record<string, unknown>>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		const resolveMarkerGraphHtml = vi
			.fn()
			.mockResolvedValueOnce({
				html: '<html><body>&amp;lt;eco-marker data-eco-node-id=&quot;n_2&quot; data-eco-integration=&quot;react&quot; data-eco-component-ref=&quot;page-component&quot; data-eco-props-ref=&quot;p_2&quot;&amp;gt;&amp;lt;/eco-marker&amp;gt;</body></html>',
				assets: [],
			})
			.mockResolvedValueOnce({
				html: '<html><body><main>Resolved twice</main></body></html>',
				assets: [],
			});

		const result = await service.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			'react',
			{
				prepareRenderOptions: async () =>
					({
						HtmlTemplate,
						Page,
						cacheStrategy: 'dynamic',
					}) as unknown as IntegrationRendererRenderOptions<unknown>,
				render: async () =>
					`<html><body>${createComponentMarker({
						nodeId: 'n_1',
						integration: 'kitajs',
						componentRef: 'html-template',
						propsRef: 'p_1',
					})}</body></html>`,
				getComponentRenderBoundaryContext: () => ({
					decideBoundaryRender: () => 'inline',
				}),
				getDocumentAttributes: () => undefined,
				resolveMarkerGraphHtml,
				dedupeProcessedAssets: (assets) => assets,
				getProcessedDependencies: () => [],
				setProcessedDependencies: vi.fn(),
				applyAttributesToHtmlElement: (html) => html,
				applyAttributesToFirstBodyElement: (html) => html,
				transformResponse: async (response) => await response.text(),
			},
		);

		expect(result.body).toContain('<main>Resolved twice</main>');
		expect(resolveMarkerGraphHtml).toHaveBeenCalledTimes(2);
	});
});
