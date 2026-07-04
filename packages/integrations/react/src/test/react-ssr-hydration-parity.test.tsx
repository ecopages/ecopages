import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { HtmlTemplateProps, IntegrationRendererRenderOptions } from '@ecopages/core';
import type { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import React, { type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { composeLayoutPageTree, assertComposablePage } from '../layout-compose.ts';
import { ReactRenderer } from '../react-renderer.ts';

class TestReactRenderer extends ReactRenderer {
	protected override async getHtmlTemplate() {
		return (({ children }: HtmlTemplateProps) =>
			children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'];
	}

	protected override async resolveDependencies() {
		return [];
	}
}

function extractLayoutMarkerOrder(html: string): string[] {
	const matches = [...html.matchAll(/data-layout="([^"]+)"/g)];
	return matches.map((match) => match[1] ?? '');
}

describe('React SSR and hydration layout parity', () => {
	const appConfig = {
		defaultMetadata: { title: 'Test', description: 'Test' },
		absolutePaths: { htmlTemplatePath: '/tmp/template.tsx', pagesDir: '/tmp/pages' },
		srcDir: '/tmp/src',
	} as unknown as EcoPagesAppConfig;

	const assetService = {
		processDependencies: vi.fn(() => Promise.resolve([])),
		getHmrManager: vi.fn(() => undefined),
	} as unknown as AssetProcessingService;

	it('should match nested layout tier order between SSR and composeLayoutPageTree', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const Outer = ({ children }: { children?: ReactNode }) => <div data-layout="outer">{children}</div>;
		const Inner = ({ children }: { children?: ReactNode }) => <div data-layout="inner">{children}</div>;
		const Page = () => <div data-layout="page">content</div>;
		Page.config = {
			layouts: [Outer, Inner],
			layout: Inner,
			layoutEntries: [{ component: Outer }, { component: Inner }],
		};

		const clientTree = composeLayoutPageTree(assertComposablePage(Page), {});
		const clientHtml = renderToString(clientTree);

		const serverHtml = String(
			await renderer.render({
				file: '/tmp/pages/nested.tsx',
				params: {},
				query: {},
				props: {},
				locals: undefined,
				pageLocals: undefined,
				metadata: appConfig.defaultMetadata,
				Page: Page as IntegrationRendererRenderOptions<ReactNode>['Page'],
				HtmlTemplate: (({ children }: HtmlTemplateProps) =>
					children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
				resolvedDependencies: [],
				pageProps: {},
			}),
		);

		expect(extractLayoutMarkerOrder(serverHtml)).toEqual(['outer', 'inner', 'page']);
		expect(extractLayoutMarkerOrder(clientHtml)).toEqual(extractLayoutMarkerOrder(serverHtml));
	});
});
