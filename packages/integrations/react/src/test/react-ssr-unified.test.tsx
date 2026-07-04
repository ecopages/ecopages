import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { HtmlTemplateProps, IntegrationRendererRenderOptions } from '@ecopages/core';
import type { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import React, { createContext, useContext, type ReactNode } from 'react';
import { ReactRenderer } from '../react-renderer.ts';

const DataContext = createContext('missing');

class TestReactRenderer extends ReactRenderer {
	protected override async getHtmlTemplate() {
		return (({ children }: HtmlTemplateProps) => (
			<html>
				<body>{children}</body>
			</html>
		)) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'];
	}

	protected override async resolveDependencies() {
		return [];
	}
}

describe('ReactRenderer unified SSR layout composition', () => {
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

	it('should render layout context providers as ancestors of the page on SSR', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const Layout = ({ children }: { children?: ReactNode }) => (
			<DataContext.Provider value="from-layout">{children}</DataContext.Provider>
		);
		const Page = () => {
			const value = useContext(DataContext);
			return <p>{value}</p>;
		};

		const body = await renderer.render({
			file: '/tmp/pages/test.tsx',
			params: {},
			query: {},
			props: {},
			locals: undefined,
			pageLocals: undefined,
			metadata: appConfig.defaultMetadata,
			Page: Page as IntegrationRendererRenderOptions<ReactNode>['Page'],
			Layout: Layout as IntegrationRendererRenderOptions<ReactNode>['Layout'],
			HtmlTemplate: (({ children }: HtmlTemplateProps) =>
				children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
			resolvedDependencies: [],
			pageProps: {},
		});

		expect(String(body)).toContain('<p>from-layout</p>');
		expect(String(body)).not.toContain('missing');
	});

	it('should nest multiple React layouts outer to inner during SSR', async () => {
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

		const body = await renderer.render({
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
		});

		const html = String(body);
		expect(html.indexOf('data-layout="outer"')).toBeLessThan(html.indexOf('data-layout="inner"'));
		expect(html.indexOf('data-layout="inner"')).toBeLessThan(html.indexOf('data-layout="page"'));
	});
});
