import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import type { AssetProcessingService, IntegrationRendererRenderOptions } from '@ecopages/core/integration';
import {
	runWithComponentRenderContext,
	type ComponentRenderInput,
	type ComponentRenderResult,
} from '@ecopages/core/integration';
import { createDeferredIntegrationPlugin, createTestAppConfig } from '@ecopages/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { lazy, Suspense, type ComponentType, type JSX, type ReactNode } from 'react';
import { ReactRenderer, type ReactRendererConfig } from '../render/react-renderer.ts';
import { renderReactHtml, resolveReactRuntimeModules, runWithRenderBudget } from '../render/react-runtime.ts';

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
const SUSPENSE_FALLBACK = <i>loading</i>;
const FALLBACK = renderToStaticMarkup(SUSPENSE_FALLBACK);

function Suspended({ children }: { children?: ReactNode }) {
	return <Suspense fallback={SUSPENSE_FALLBACK}>{children}</Suspense>;
}

/**
 * Narrows what `eco.page()`, `eco.layout()` and `eco.component()` return to the renderer's input type in one place.
 */
function asEcoComponent(view: object): EcoComponent {
	return view as unknown as EcoComponent;
}

afterAll(() => {
	rmSync(testDir, { recursive: true, force: true });
});

async function createRenderer(
	renderDeferredComponent?: (input: ComponentRenderInput) => Promise<ComponentRenderResult>,
	reactConfig?: ReactRendererConfig,
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
		reactConfig,
	});
}

/**
 * A `lazy` component whose module settles on a later macrotask, so the first render pass always suspends.
 */
function lazyNever<P extends object>() {
	return lazy(() => new Promise<{ default: ComponentType<P> }>(() => {}));
}

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

async function renderPage(renderer: ReactRenderer, Page: object, Layout?: object): Promise<string> {
	const body = await renderer.render({
		file: path.join(testDir, 'pages/index.tsx'),
		params: {},
		query: {},
		props: {},
		metadata: { title: 'Suspense', description: 'Suspense' },
		Page: asEcoComponent(Page) as IntegrationRendererRenderOptions<ReactNode>['Page'],
		Layout: (Layout && asEcoComponent(Layout)) as IntegrationRendererRenderOptions<ReactNode>['Layout'],
		HtmlTemplate: (({ children }: HtmlTemplateProps) =>
			children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
		resolvedDependencies: [],
		pageProps: {},
	});
	return await new Response(body as BodyInit).text();
}

/**
 * Renders like `renderPage` and returns the messages of the errors logged with `console.error` meanwhile.
 */
async function renderPageCapturingLoggedErrors(renderer: ReactRenderer, Page: object) {
	const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		const html = await renderPage(renderer, Page);
		const errors = consoleError.mock.calls
			.flat()
			.flatMap((logged) => (logged instanceof Error ? [logged.message] : []));
		return { html, errors };
	} finally {
		consoleError.mockRestore();
	}
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
					<Suspended>
						<LazyContent />
					</Suspended>
				</main>
			),
		});

		const html = await renderPage(await createRenderer(), Page);

		expect(html).toContain('<p>lazy page content</p>');
		expect(html).not.toContain(FALLBACK);
	});

	it('renders a lazy component inside a layout on the server', async () => {
		const LazyNav = lazyAfterTick(() => () => <nav>lazy layout nav</nav>);
		const Layout = eco.layout<JSX.Element>({
			integration: 'react',
			render: ({ children }) => (
				<div data-layout="root">
					<Suspended>
						<LazyNav />
					</Suspended>
					{children as ReactNode}
				</div>
			),
		});
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			layout: Layout as never,
			render: () => <p>page body</p>,
		});

		const html = await renderPage(await createRenderer(), Page, Layout);

		expect(html).toContain('<nav>lazy layout nav</nav>');
		expect(html).toContain('<p>page body</p>');
		expect(html).not.toContain(FALLBACK);
	});

	it('renders a lazy component inside a React island of a non-React Page on the server', async () => {
		const LazyWidget = lazyAfterTick(() => () => <span>lazy island content</span>);
		const Island = eco.component<Record<string, never>, JSX.Element>({
			integration: 'react',
			render: () => (
				<section>
					<Suspended>
						<LazyWidget />
					</Suspended>
				</section>
			),
		});

		const renderer = await createRenderer();
		const { value: result } = await runWithComponentRenderContext({ currentIntegration: 'kitajs' }, async () =>
			renderer.renderComponent({
				component: asEcoComponent(Island),
				props: {},
				integrationContext: { componentInstanceId: 'island-lazy' },
			}),
		);

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
					<Suspended>
						<LazyHost />
					</Suspended>
				</main>
			),
		});

		const html = await renderPage(await createRenderer(), Page);

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
						<Suspended>
							<LazyChild />
						</Suspended>
					</ForeignWidget>
				</main>
			),
		});

		const html = await renderPage(renderer, Page);

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
					<Suspended>
						<LazyFrame>{children}</LazyFrame>
					</Suspended>
				</section>
			),
		});

		const renderer = await createRenderer();
		const result = await renderer.renderComponentWithForeignChildren({
			component: asEcoComponent(Frame),
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
						<Suspended>
							<SharedLazy label={label} />
						</Suspended>
					</main>
				),
			});

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
			cause: 'a lazy import rejects with AbortError',
			message: 'lazy import aborted',
			Failing: lazyAfterTick(() => new DOMException('lazy import aborted', 'AbortError')),
		},
		{
			cause: 'a component inside the boundary throws',
			message: 'component render failed',
			Failing: () => {
				throw new Error('component render failed');
			},
		},
	])(
		'serves the boundary fallback, renders the rest of the Page and logs the error when $cause',
		async ({ message, Failing }) => {
			const Page = eco.page<Record<string, unknown>, JSX.Element>({
				integration: 'react',
				render: () => (
					<main>
						<p>rest of the page</p>
						<Suspended>
							<Failing />
						</Suspended>
					</main>
				),
			});

			const { html, errors } = await renderPageCapturingLoggedErrors(await createRenderer(), Page);

			expect(html).toContain('<p>rest of the page</p>');
			expect(html).toContain(FALLBACK);
			expect(errors).toEqual([message]);
		},
	);

	it('logs the error of every failing boundary', async () => {
		const FirstFailing = lazyAfterTick(() => new Error('first boundary failed'));
		const SecondFailing = () => {
			throw new Error('second boundary failed');
		};
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => (
				<main>
					<Suspended>
						<FirstFailing />
					</Suspended>
					<Suspended>
						<SecondFailing />
					</Suspended>
				</main>
			),
		});

		const { html, errors } = await renderPageCapturingLoggedErrors(await createRenderer(), Page);

		expect(html.split(FALLBACK)).toHaveLength(3);
		expect(errors.sort()).toEqual(['first boundary failed', 'second boundary failed']);
	});

	it('fails the render with the original error when a component outside every boundary throws', async () => {
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => {
				throw new Error('page failed');
			},
		});

		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const render = renderPage(await createRenderer(), Page);

			await expect(render).rejects.toThrow('page failed');
			await expect(render).rejects.toHaveProperty('cause.message', 'page failed');
		} finally {
			consoleError.mockRestore();
		}
	});

	it('keeps a large resolved boundary inline instead of revealing it with a script', async () => {
		const largeText = 'x'.repeat(20_000);
		const LazyLarge = lazyAfterTick(() => () => <article>{largeText}</article>);
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => (
				<main>
					<Suspended>
						<LazyLarge />
					</Suspended>
				</main>
			),
		});

		const html = await renderPage(await createRenderer(), Page);

		expect(html).toContain(`<article>${largeText}</article>`);
		expect(html).not.toContain('<script');
		expect(html).not.toContain('<template');
		expect(html).not.toContain(FALLBACK);
	});

	it('serves the fallback when a lazy import never settles', async () => {
		const NeverContent = lazyNever();
		const pageFile = path.join(testDir, 'pages/index.tsx');
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			identity: { id: 'index', file: pageFile, integration: 'react' },
			render: () => (
				<main>
					<p>rest of the page</p>
					<Suspended>
						<NeverContent />
					</Suspended>
				</main>
			),
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const started = Date.now();

		try {
			const html = await renderPage(await createRenderer(undefined, { renderTimeoutMs: 50 }), Page);
			const elapsed = Date.now() - started;

			expect(elapsed).toBeGreaterThanOrEqual(50);
			expect(elapsed).toBeLessThan(2_000);
			expect(html).toContain('<p>rest of the page</p>');
			expect(html).toContain(FALLBACK);
			expect(html).not.toContain('never');
			expect(html).not.toContain('<script');
			expect(warn.mock.calls.flat().join(' ')).toContain(pageFile);
			expect(warn.mock.calls.flat().join(' ')).toMatch(/did not settle in time/);
			expect(error).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
			error.mockRestore();
		}
	});

	it('fails the render when the shell does not finish within the render time limit', async () => {
		const NeverContent = lazyNever();
		const pageFile = path.join(testDir, 'pages/index.tsx');
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			identity: { id: 'index', file: pageFile, integration: 'react' },
			render: () => (
				<main>
					<NeverContent />
				</main>
			),
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		try {
			const render = renderPage(await createRenderer(undefined, { renderTimeoutMs: 50 }), Page);

			await expect(render).rejects.toHaveProperty('cause.name', 'ReactRenderError');
			await expect(render).rejects.toHaveProperty(
				'cause.message',
				`React server rendering of ${pageFile} produced no HTML: its shell did not finish within the 50ms render time limit.`,
			);
		} finally {
			error.mockRestore();
		}
	});

	it('keeps the Island Host attributes of an island whose boundary timed out', async () => {
		const NeverContent = lazyNever();
		const Island = eco.component<Record<string, never>, JSX.Element>({
			integration: 'react',
			identity: { id: 'timed-out-island', file: '/app/components/timed-out-island.tsx', integration: 'react' },
			render: () => (
				<section>
					<Suspended>
						<NeverContent />
					</Suspended>
				</section>
			),
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			const renderer = await createRenderer(undefined, { renderTimeoutMs: 50 });
			const { value: result } = await runWithComponentRenderContext({ currentIntegration: 'kitajs' }, async () =>
				renderer.renderComponent({
					component: asEcoComponent(Island),
					props: {},
					integrationContext: { componentInstanceId: 'island-timed-out' },
				}),
			);

			expect(result.html).toContain(FALLBACK);
			expect(result.html).not.toContain('<script');
			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootAttributes).toBeDefined();
		} finally {
			warn.mockRestore();
		}
	});

	it('waits 10 seconds by default', async () => {
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => <main>ready</main>,
		});
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

		try {
			await renderPage(await createRenderer(), Page);
			const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay ?? 0);

			expect(delays.some((delay) => delay > 9_000 && delay <= 10_000)).toBe(true);
		} finally {
			setTimeoutSpy.mockRestore();
		}
	});

	it('serves the fallback of a timed-out boundary at the root of a tree', async () => {
		const runtime = resolveReactRuntimeModules(undefined);
		const NeverContent = lazyNever();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			const html = await renderReactHtml(
				runtime,
				<Suspended>
					<NeverContent />
				</Suspended>,
				{ timeoutMs: 50, label: 'root boundary' },
			);

			expect(html).toContain(FALLBACK);
			expect(html).toContain('<!--$!-->');
			expect(html).not.toContain('<script');
		} finally {
			warn.mockRestore();
		}
	});

	it('shares one deadline and one warning across the React renders of one route', async () => {
		const runtime = resolveReactRuntimeModules(undefined);
		const NeverContent = lazyNever();
		const tree = (label: string) => (
			<div>
				<p>{label}</p>
				<Suspended>
					<NeverContent />
				</Suspended>
			</div>
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const started = Date.now();

		try {
			const [first, second] = await runWithRenderBudget({ timeoutMs: 200, label: 'the route' }, async () => [
				await renderReactHtml(runtime, tree('first tree'), { timeoutMs: 200, label: 'first' }),
				await renderReactHtml(runtime, tree('second tree'), { timeoutMs: 200, label: 'second' }),
			]);
			const elapsed = Date.now() - started;

			expect(elapsed).toBeLessThan(400);
			expect(first).toContain('<p>first tree</p>');
			expect(second).toContain('<p>second tree</p>');
			expect(second).toContain(FALLBACK);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls.flat().join(' ')).toContain('the route');
		} finally {
			warn.mockRestore();
		}
	});

	it('fails the render when a boundary renders a precedence stylesheet', async () => {
		const pageFile = path.join(testDir, 'pages/index.tsx');
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			identity: { id: 'index', file: pageFile, integration: 'react' },
			render: () => (
				<main>
					<p>rest of the page</p>
					<Suspended>
						<>
							<link rel="stylesheet" href="/theme.css" precedence="default" />
							<p>styled</p>
						</>
					</Suspended>
				</main>
			),
		});

		const render = renderPage(await createRenderer(), Page);

		await expect(render).rejects.toThrow(pageFile);
		await expect(render).rejects.toThrow(/Dependency/);
	});

	it('still renders a lazy component that settles within the render time limit', async () => {
		const LazyContent = lazyAfterTick(() => () => <p>within limit</p>);
		const Page = eco.page<Record<string, unknown>, JSX.Element>({
			integration: 'react',
			render: () => (
				<main>
					<Suspended>
						<LazyContent />
					</Suspended>
				</main>
			),
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			const html = await renderPage(await createRenderer(undefined, { renderTimeoutMs: 500 }), Page);

			expect(html).toContain('<p>within limit</p>');
			expect(html).not.toContain(FALLBACK);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});
