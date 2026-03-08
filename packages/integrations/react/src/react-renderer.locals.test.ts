import { describe, it, expect, vi } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import type { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import type { HtmlTemplateProps, IntegrationRendererRenderOptions } from '@ecopages/core';
import type { ReactNode } from 'react';
import { ReactRenderer } from './react-renderer.ts';

class TestReactRenderer extends ReactRenderer {
	override async buildRouteRenderAssets(_pagePath: string) {
		return [];
	}

	protected override async getHtmlTemplate() {
		return (({ children }: HtmlTemplateProps) => `<html><body>${children}</body></html>`) as never;
	}

	protected override async resolveDependencies() {
		return [];
	}
}

describe('ReactRenderer locals split', () => {
	const appConfig = {
		defaultMetadata: {
			title: 'Test',
			description: 'Test',
		},
		absolutePaths: {
			htmlTemplatePath: '/tmp/template.tsx',
			pagesDir: '/tmp/pages',
		},
		srcDir: '/tmp/src',
	} as unknown as EcoPagesAppConfig;

	const assetService = {
		processDependencies: vi.fn(() => Promise.resolve([])),
		getHmrManager: vi.fn(() => undefined),
	} as unknown as AssetProcessingService;

	it('uses pageLocals for Page and locals for Layout', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const pageRenderMock = vi.fn((_props: { locals?: unknown }) => {
			return 'page' as unknown as ReactNode;
		});
		const Page = pageRenderMock as unknown as IntegrationRendererRenderOptions<ReactNode>['Page'];

		const layoutRenderMock = vi.fn((props: { children: ReactNode; locals?: unknown }) => {
			return props.children as unknown as ReactNode;
		});
		const Layout = layoutRenderMock as unknown as IntegrationRendererRenderOptions<ReactNode>['Layout'];

		const guardedPageLocals = new Proxy(
			{},
			{
				get: () => {
					throw new Error('guarded proxy');
				},
			},
		) as Record<string, unknown>;

		await renderer.render({
			file: '/tmp/pages/test.tsx',
			params: {},
			query: {},
			props: {},
			locals: undefined,
			pageLocals: guardedPageLocals,
			metadata: appConfig.defaultMetadata,
			Page,
			Layout,
			HtmlTemplate: (({ children }: HtmlTemplateProps) =>
				children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
			resolvedDependencies: [],
			pageProps: {},
		});

		expect(pageRenderMock.mock.calls[0]?.[0]?.locals).toBe(guardedPageLocals);
		expect(layoutRenderMock.mock.calls[0]?.[0]?.locals).toBeUndefined();
	});
});
