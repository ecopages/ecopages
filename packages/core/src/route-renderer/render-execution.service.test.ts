import { describe, expect, it, vi } from 'vitest';
import { getComponentRenderContext } from '../eco/component-render-context.ts';
import type { EcoComponent, IntegrationRendererRenderOptions, RouteRendererOptions } from '../public-types.ts';
import type { ProcessedAsset } from '../services/asset-processing-service/index.ts';
import { createComponentMarker } from './component-marker.ts';
import { RenderExecutionService } from './render-execution.service.ts';

describe('RenderExecutionService', () => {
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
				transformHtml: async (html) => html,
			},
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
			expect(result.body).toContain('<html data-eco-document-owner="react-router"><body>');
		expect(result.body).toContain('<main data-eco-component-id="eco-page-root">Resolved</main>');
		expect(setProcessedDependencies).toHaveBeenCalledWith([asset]);
		expect(dedupeProcessedAssets).toHaveBeenCalled();
		expect(resolveMarkerGraphHtml).toHaveBeenCalledTimes(1);
	});
});
