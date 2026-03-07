import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { EcoComponent, EcoPageComponent, HtmlTemplateProps, RouteRendererOptions } from '../public-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../services/asset-processing-service/index.ts';
import { RenderPreparationService } from './render-preparation.service.ts';

declare module '../public-types.ts' {
	interface RequestLocals {
		user?: string;
		guarded?: boolean;
	}
}

describe('RenderPreparationService', () => {
	it('should prepare dynamic render options and merge renderer-owned assets', async () => {
		const integrationDependency = {
			kind: 'script',
			srcUrl: '/assets/react-runtime.js',
			position: 'head',
		} as ProcessedAsset;
		const componentAsset = {
			kind: 'script',
			srcUrl: '/assets/page-root.js',
			position: 'head',
		} as ProcessedAsset;
		const resolvedDependency = {
			kind: 'stylesheet',
			srcUrl: '/assets/page.css',
			position: 'head',
		} as ProcessedAsset;
		const pageDependency = {
			kind: 'script',
			srcUrl: '/assets/page-entry.js',
			position: 'head',
		} as ProcessedAsset;
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [integrationDependency],
				},
			],
		} as unknown as EcoPagesAppConfig;
		const service = new RenderPreparationService(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
		};
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.cache = 'dynamic';
		Page.config = {
			dependencies: {
				components: [Nested],
			},
		};
		const routeOptions = {
			file: '/app/pages/index.tsx',
			params: { slug: 'hello' },
			query: { preview: '1' },
			locals: { user: 'andee' },
		} as unknown as RouteRendererOptions;
		const setProcessedDependencies = vi.fn();

		const result = await service.prepare(routeOptions, 'ghtml', {
			resolvePageModule: async () => ({
				Page,
				integrationSpecificProps: { layoutMode: 'full' },
			}),
			getHtmlTemplate: async () => HtmlTemplate,
			resolvePageData: async () => ({
				props: { title: 'Hello' },
				metadata: { title: 'Hello', description: 'Hello description' },
			}),
			resolveDependencies: async () => [resolvedDependency],
			buildRouteRenderAssets: async () => [pageDependency],
			shouldRenderPageComponent: () => true,
			renderPageComponent: async () => ({
				html: '<main>Page</main>',
				canAttachAttributes: true,
				rootTag: 'main',
				integrationName: 'ghtml',
				assets: [componentAsset],
			}),
			getComponentRenderBoundaryContext: () => ({
				decideBoundaryRender: () => 'inline',
			}),
			setProcessedDependencies,
			dedupeProcessedAssets: (assets) => assets,
			createPageLocalsProxy: () => ({ guarded: true }),
		});

		expect(result.locals).toEqual({ user: 'andee' });
		expect(result.pageLocals).toEqual({ user: 'andee' });
		expect(result.pageProps).toEqual({ title: 'Hello', params: { slug: 'hello' }, query: { preview: '1' } });
		expect((result as typeof result & { layoutMode?: string }).layoutMode).toBe('full');
		expect(result.componentRender?.assets).toEqual([componentAsset]);
		expect(setProcessedDependencies).toHaveBeenCalledWith([
			resolvedDependency,
			integrationDependency,
			pageDependency,
			componentAsset,
		]);
	});

	it('should guard page locals for static pages and skip page-root rendering when disabled', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const service = new RenderPreparationService(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const renderPageComponent = vi.fn();

		const result = await service.prepare(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
				locals: { hidden: true },
			} as unknown as RouteRendererOptions,
			'ghtml',
			{
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Static page', description: 'Static page description' },
				}),
				resolveDependencies: async () => [],
				buildRouteRenderAssets: async () => [],
				shouldRenderPageComponent: () => false,
				renderPageComponent,
				getComponentRenderBoundaryContext: () => ({
					decideBoundaryRender: () => 'inline',
				}),
				setProcessedDependencies: vi.fn(),
				dedupeProcessedAssets: (assets) => assets,
				createPageLocalsProxy: () => ({ guarded: true }),
			},
		);

		expect(result.locals).toBeUndefined();
		expect(result.pageLocals).toEqual({ guarded: true });
		expect(result.componentRender).toBeUndefined();
		expect(renderPageComponent).not.toHaveBeenCalled();
	});
});
