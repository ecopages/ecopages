import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import type { AssetProcessingService, IntegrationRendererRenderOptions } from '@ecopages/core/integration';
import type { ComponentRenderInput, ComponentRenderResult } from '@ecopages/core/integration';
import { createDeferredIntegrationPlugin, createTestAppConfig } from '@ecopages/testing';
import { lazy, Suspense, type ComponentType, type JSX, type ReactNode } from 'react';
import { ReactRenderer } from '../render/react-renderer.ts';

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

const testDir = mkdtempSync(path.join(os.tmpdir(), 'react-ssr-suspense-'));
const FALLBACK = '<i>loading</i>';

afterAll(() => {
	rmSync(testDir, { recursive: true, force: true });
});

async function createRenderer(
	renderDeferredComponent?: (input: ComponentRenderInput) => Promise<ComponentRenderResult>,
) {
	const appConfig = await createTestAppConfig({
		distDir: testDir,
		integrations: [createDeferredIntegrationPlugin({ renderComponent: renderDeferredComponent })],
	});
	return new TestReactRenderer({
		appConfig,
		assetProcessingService: {
			processDependencies: vi.fn(async () => []),
			getHmrManager: vi.fn(() => undefined),
		} as unknown as AssetProcessingService,
	});
}

/**
 * A `lazy` component whose module settles on a later macrotask, so the first render pass always suspends.
 */
function lazyAfterTick<P extends object>(load: () => ComponentType<P> | Error) {
	return lazy(
		() =>
			new Promise<{ default: ComponentType<P> }>((resolve, reject) => {
				setTimeout(() => {
					const result = load();
					if (result instanceof Error) {
						reject(result);
					} else {
						resolve({ default: result });
					}
				}, 5);
			}),
	);
}

async function renderPage(renderer: ReactRenderer, Page: EcoComponent, Layout?: EcoComponent): Promise<string> {
	const body = await renderer.render({
		file: path.join(testDir, 'pages/index.tsx'),
		params: {},
		query: {},
		props: {},
		metadata: { title: 'Suspense', description: 'Suspense' },
		Page: Page as IntegrationRendererRenderOptions<ReactNode>['Page'],
		Layout: Layout as IntegrationRendererRenderOptions<ReactNode>['Layout'],
		HtmlTemplate: (({ children }: HtmlTemplateProps) =>
			children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
		resolvedDependencies: [],
		pageProps: {},
	});
	return await new Response(body as BodyInit).text();
}

const DeferredWidget = eco.component<{ label?: string; children?: ReactNode }, string>({
	identity: {
		id: 'deferred-widget',
		file: '/app/components/deferred-widget.deferred.tsx',
		integration: 'deferred',
	},
	integration: 'deferred',
	render: () => '',
});
const ForeignWidget = DeferredWidget as unknown as ComponentType<{ label?: string; children?: ReactNode }>;

describe('React server rendering waits for Suspense', () => {
	it('renders a lazy component inside a Page on the server', async () => {
		const LazyContent = lazyAfterTick(() => () => <p>lazy page content</p>);
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => (
				<main>
					<Suspense fallback={<i>loading</i>}>
						<LazyContent />
					</Suspense>
				</main>
			),
		});

		const html = await renderPage(await createRenderer(), Page as unknown as EcoComponent);

		expect(html).toContain('<p>lazy page content</p>');
		expect(html).not.toContain(FALLBACK);
	});

	it('renders a lazy component inside a layout on the server', async () => {
		const LazyNav = lazyAfterTick(() => () => <nav>lazy layout nav</nav>);
		const Layout = eco.layout<JSX.Element>({
			integration: 'react',
			render: ({ children }) => (
				<div data-layout="root">
					<Suspense fallback={<i>loading</i>}>
						<LazyNav />
					</Suspense>
					{children as ReactNode}
				</div>
			),
		});
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			layout: Layout as never,
			render: () => <p>page body</p>,
		});

		const html = await renderPage(
			await createRenderer(),
			Page as unknown as EcoComponent,
			Layout as unknown as EcoComponent,
		);

		expect(html).toContain('<nav>lazy layout nav</nav>');
		expect(html).toContain('<p>page body</p>');
		expect(html).not.toContain(FALLBACK);
	});

	it('renders a lazy component inside a React island on the server', async () => {
		const LazyWidget = lazyAfterTick(() => () => <span>lazy island content</span>);
		const Island = eco.component<Record<string, never>, JSX.Element>({
			integration: 'react',
			render: () => (
				<section>
					<Suspense fallback={<i>loading</i>}>
						<LazyWidget />
					</Suspense>
				</section>
			),
		});

		const renderer = await createRenderer();
		const result = await renderer.renderComponentWithForeignChildren({
			component: Island as unknown as EcoComponent,
			props: {},
			integrationContext: { componentInstanceId: 'island-lazy' },
		});

		expect(result.html).toContain('<span>lazy island content</span>');
		expect(result.html).not.toContain(FALLBACK);
	});

	it('resolves a foreign child rendered inside a suspended tree', async () => {
		const LazyHost = lazyAfterTick(() => () => (
			<aside>
				<ForeignWidget />
			</aside>
		));
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			dependencies: { components: [DeferredWidget] },
			render: () => (
				<main>
					<Suspense fallback={<i>loading</i>}>
						<LazyHost />
					</Suspense>
				</main>
			),
		});

		const html = await renderPage(await createRenderer(), Page as unknown as EcoComponent);

		expect(html).toContain('<aside><button data-testid="deferred-widget">Deferred widget</button></aside>');
		expect(html).not.toContain('eco-marker');
		expect(html).not.toContain('__ECO_');
		expect(html).not.toContain(FALLBACK);
	});

	it('renders suspended React children of a foreign component before the foreign component wraps them', async () => {
		const renderer = await createRenderer(async (input) => ({
			html: `<div data-host>${String(input.children ?? '')}</div>`,
			canAttachAttributes: true,
			integrationName: 'deferred',
		}));
		const LazyChild = lazyAfterTick(() => () => <p>lazy child of a foreign host</p>);
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			dependencies: { components: [DeferredWidget] },
			render: () => (
				<main>
					<ForeignWidget>
						<Suspense fallback={<i>loading</i>}>
							<LazyChild />
						</Suspense>
					</ForeignWidget>
				</main>
			),
		});

		const html = await renderPage(renderer, Page as unknown as EcoComponent);

		expect(html).toMatch(
			/<div data-host>(<!--[^>]*-->)*<p>lazy child of a foreign host<\/p>(<!--[^>]*-->)*<\/div>/,
		);
		expect(html).not.toContain('__ECO_');
		expect(html).not.toContain(FALLBACK);
	});

	it('keeps resolved child HTML raw when it renders inside a suspended subtree', async () => {
		const LazyFrame = lazyAfterTick(() => ({ children }: { children?: ReactNode }) => (
			<div data-frame="lazy">{children}</div>
		));
		const Frame = eco.component<{ children?: ReactNode }, JSX.Element>({
			integration: 'react',
			render: ({ children }) => (
				<section>
					<Suspense fallback={<i>loading</i>}>
						<LazyFrame>{children}</LazyFrame>
					</Suspense>
				</section>
			),
		});

		const renderer = await createRenderer();
		const result = await renderer.renderComponentWithForeignChildren({
			component: Frame as unknown as EcoComponent,
			props: {},
			children: '<b data-raw>raw</b>',
			integrationContext: { componentInstanceId: 'frame' },
		});

		expect(result.html).toContain('<div data-frame="lazy"><b data-raw>raw</b></div>');
		expect(result.html.match(/data-raw/g)).toHaveLength(1);
		expect(result.html).not.toContain('__ECO_RAW_HTML_CHILD_');
	});

	it('keeps foreign children of concurrent renders apart when they share a lazy component', async () => {
		const renderer = await createRenderer(async (input) => ({
			html: `<em>${String(input.props.label)}</em>`,
			canAttachAttributes: true,
			integrationName: 'deferred',
		}));
		const SharedLazy = lazyAfterTick(() => ({ label }: { label: string }) => <ForeignWidget label={label} />);
		const createPage = (label: string) =>
			eco.page<Record<string, unknown>, JSX.Element>({
				integration: 'react',
				dependencies: { components: [DeferredWidget] },
				render: () => (
					<main>
						<Suspense fallback={<i>loading</i>}>
							<SharedLazy label={label} />
						</Suspense>
					</main>
				),
			}) as unknown as EcoComponent;

		const [first, second] = await Promise.all([
			renderPage(renderer, createPage('first')),
			renderPage(renderer, createPage('second')),
		]);

		expect(first).toContain('<em>first</em>');
		expect(first).not.toContain('<em>second</em>');
		expect(second).toContain('<em>second</em>');
		expect(second).not.toContain('<em>first</em>');
	});

	it.each([
		{
			cause: 'a lazy import rejects',
			message: 'lazy import failed',
			Failing: lazyAfterTick(() => new Error('lazy import failed')),
		},
		{
			cause: 'a component inside the boundary throws',
			message: 'component render failed',
			Failing: () => {
				throw new Error('component render failed');
			},
		},
	])('fails the render when $cause', async ({ message, Failing }) => {
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => (
				<main>
					<Suspense fallback={<i>loading</i>}>
						<Failing />
					</Suspense>
				</main>
			),
		});

		await expect(renderPage(await createRenderer(), Page as unknown as EcoComponent)).rejects.toThrow(message);
	});

	it('keeps a large resolved boundary inline instead of revealing it with a script', async () => {
		const largeText = 'x'.repeat(20_000);
		const LazyLarge = lazyAfterTick(() => () => <article>{largeText}</article>);
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => (
				<main>
					<Suspense fallback={<i>loading</i>}>
						<LazyLarge />
					</Suspense>
				</main>
			),
		});

		const html = await renderPage(await createRenderer(), Page as unknown as EcoComponent);

		expect(html).toContain(`<article>${largeText}</article>`);
		expect(html).not.toContain('<script');
		expect(html).not.toContain('<template');
		expect(html).not.toContain(FALLBACK);
	});
});
