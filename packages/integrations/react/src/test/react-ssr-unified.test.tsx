import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, useContext, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { IntegrationRendererRenderOptions } from '@ecopages/core/integration';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import type { AssetProcessingService } from '@ecopages/core/integration';
import { ReactRenderer } from '../render/react-renderer.ts';

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

const integrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appConfig = await finalizeEcoPagesConfig({
	rootDir: integrationRoot,
	defaultMetadata: {
		title: 'Test',
		description: 'Test',
	},
});

describe('ReactRenderer unified SSR layout composition', () => {
	const assetService = {
		processDependencies: vi.fn(() => Promise.resolve([])),
		getHmrManager: vi.fn(() => undefined),
	} as unknown as AssetProcessingService;

	it('should render layout context providers as ancestors of the page on SSR', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
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

	describe('a layout that does not render its children', () => {
		function renderNested(layouts: Array<(props: { children?: ReactNode }) => ReactNode>) {
			const renderer = new TestReactRenderer({ appConfig, assetProcessingService: assetService });
			const Page = () => <p>content</p>;
			Page.config = {
				identity: { id: 'page', file: '/tmp/pages/nested.tsx', integration: 'react' },
				layouts,
				layoutEntries: layouts.map((component) => ({ component })),
			};

			return renderer.render({
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
		}

		const message = '[ecopages] Layout DroppingLayout (/tmp/pages/nested.tsx) did not render its children';
		const Outer = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
		const DroppingLayout = () => <aside>sign in first</aside>;

		afterEach(() => {
			appConfig.appRuntime!.staticGenerationActive = false;
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
		});

		it('fails static build output, naming a plain layout and the page that uses it', async () => {
			appConfig.appRuntime!.staticGenerationActive = true;

			await expect(renderNested([Outer, DroppingLayout])).rejects.toThrow(
				expect.objectContaining({ cause: expect.objectContaining({ message }) }),
			);
		});

		it('warns and returns the layout output on a development request-time render', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

			await expect(renderNested([Outer, DroppingLayout]).then(String)).resolves.toContain(
				'<div><aside>sign in first</aside></div>',
			);
			expect(warn).toHaveBeenCalledWith(expect.anything(), message, expect.anything());
		});

		it('returns the layout output without a log on a production request-time render', async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

			await expect(renderNested([Outer, DroppingLayout]).then(String)).resolves.toContain(
				'<div><aside>sign in first</aside></div>',
			);
			expect(warn).not.toHaveBeenCalledWith(expect.anything(), message, expect.anything());
		});

		it('renders a stack whose layouts all render their children', async () => {
			const Outer = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
			const Inner = ({ children }: { children?: ReactNode }) => <section>{children}</section>;

			await expect(renderNested([Outer, Inner]).then(String)).resolves.toContain(
				'<div><section><p>content</p></section></div>',
			);
		});
	});
});
