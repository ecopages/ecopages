import { describe, it, expect, vi } from 'vitest';
import type { AssetProcessingService } from '@ecopages/core/integration';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { IntegrationRendererRenderOptions } from '@ecopages/core/integration';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { path } from '@ecopages/file-system/path';
import type { ReactNode } from 'react';
import { ECO_PAGE_DATA_TIERS_KEY } from '../hydration/page-data-manifest.ts';
import { ReactRenderer } from './react-renderer.ts';

class TestReactRenderer extends ReactRenderer {
	protected override async getHtmlTemplate() {
		return (({ children }: HtmlTemplateProps) => `<html><body>${children}</body></html>`) as never;
	}

	protected override async resolveDependencies() {
		return [];
	}
}

const appConfig = await finalizeEcoPagesConfig({
	rootDir: path.cwd(),
	defaultMetadata: {
		title: 'Test',
		description: 'Test',
	},
});

describe('ReactRenderer request locals', () => {
	const assetService = {
		processDependencies: vi.fn(() => Promise.resolve([])),
		getHmrManager: vi.fn(() => undefined),
	} as unknown as AssetProcessingService;

	it('gives neither the Page nor its Layout the request locals', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
		});

		const pageRenderMock = vi.fn((_props: Record<string, unknown>) => {
			return 'page' as unknown as ReactNode;
		});
		const Page = pageRenderMock as unknown as IntegrationRendererRenderOptions<ReactNode>['Page'];

		const layoutRenderMock = vi.fn((props: { children: ReactNode }) => {
			return props.children as unknown as ReactNode;
		});
		const Layout = layoutRenderMock as unknown as IntegrationRendererRenderOptions<ReactNode>['Layout'];

		await renderer.render({
			file: '/tmp/pages/test.tsx',
			params: {},
			query: {},
			props: { title: 'Hello' },
			locals: { session: { userId: 'u-1' } },
			metadata: appConfig.defaultMetadata,
			Page,
			Layout,
			HtmlTemplate: (({ children }: HtmlTemplateProps) =>
				children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
			resolvedDependencies: [],
			pageProps: {},
		});

		expect(pageRenderMock.mock.calls[0]?.[0]).toEqual({ title: 'Hello', params: {}, query: {} });
		expect(layoutRenderMock.mock.calls[0]?.[0]).not.toHaveProperty('locals');
	});

	it('runs each layout factory once, renders the layout from its result and puts exactly that in the hydration payload', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
		});
		const layoutRenderMock = vi.fn((props: { children: ReactNode; user?: string; locals?: unknown }) => {
			return props.children as unknown as ReactNode;
		});
		const Layout = layoutRenderMock as unknown as IntegrationRendererRenderOptions<ReactNode>['Layout'];
		let evaluations = 0;
		const factory = vi.fn(({ locals }: { locals?: Record<string, unknown> }) => {
			const session = locals?.session as { userId: string };
			evaluations += 1;
			return { user: `${session.userId}#${evaluations}` };
		});
		const Page = Object.assign(
			vi.fn(() => 'page' as unknown as ReactNode),
			{ config: { layouts: [Layout], layoutEntries: [{ component: Layout, props: factory }] } as never },
		) as unknown as IntegrationRendererRenderOptions<ReactNode>['Page'];
		const htmlTemplateMock = vi.fn(({ children }: HtmlTemplateProps) => children as ReactNode);
		const locals = { session: { userId: 'u-1' }, csrfSecret: 'server-only-secret' } as unknown as Record<
			string,
			unknown
		>;

		await renderer.render({
			file: '/tmp/pages/test.tsx',
			params: {},
			query: {},
			props: {},
			locals,
			metadata: appConfig.defaultMetadata,
			Page,
			Layout,
			layoutEntries: [{ component: Layout as never, props: factory as never }],
			HtmlTemplate: htmlTemplateMock as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
			resolvedDependencies: [],
			pageProps: {},
		});

		const pageProps = htmlTemplateMock.mock.calls[0]?.[0]?.pageProps as Record<string, unknown>;
		expect(factory).toHaveBeenCalledTimes(1);
		expect(layoutRenderMock.mock.calls[0]?.[0]).toMatchObject({ user: 'u-1#1' });
		expect(layoutRenderMock.mock.calls[0]?.[0]).not.toHaveProperty('locals');
		expect(pageProps[ECO_PAGE_DATA_TIERS_KEY]).toEqual([{ user: 'u-1#1' }]);
		expect(pageProps).not.toHaveProperty('locals');
		expect(JSON.stringify(pageProps)).not.toContain('server-only-secret');
	});

	it('serializes the page props, Params and Query, never the request locals', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
		});

		const Page = vi.fn(
			() => 'page' as unknown as ReactNode,
		) as unknown as IntegrationRendererRenderOptions<ReactNode>['Page'];
		const htmlTemplateMock = vi.fn(({ children }: HtmlTemplateProps) => children as ReactNode);

		await renderer.render({
			file: '/tmp/pages/test.tsx',
			params: { slug: 'a' },
			query: { tab: 'x' },
			props: { user: 'Ada' },
			locals: { session: { userId: 'u-1', token: 'server-only-secret' } },
			metadata: appConfig.defaultMetadata,
			Page,
			Layout: undefined,
			HtmlTemplate: htmlTemplateMock as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
			resolvedDependencies: [],
			pageProps: { user: 'Ada', params: { slug: 'a' }, query: { tab: 'x' } },
		});

		const pageProps = htmlTemplateMock.mock.calls[0]?.[0]?.pageProps;
		expect(pageProps).toEqual({ user: 'Ada', params: { slug: 'a' }, query: { tab: 'x' } });
		expect(JSON.stringify(pageProps)).not.toContain('server-only-secret');
	});
});
