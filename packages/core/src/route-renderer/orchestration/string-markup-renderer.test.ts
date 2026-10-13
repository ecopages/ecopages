import { describe, expect, it, vi } from 'vitest';
import HtmlTemplate from '../../../__fixtures__/app/src/includes/html.ts';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.ts';
import { eco, type ForeignSubtreeRenderPayload, type EcoComponent, type HtmlTemplateProps } from '../../index.ts';
import { toForeignSubtreeRenderPayload } from '../../route-renderer/orchestration/foreign-child/foreign-subtree-execution.service.ts';
import { HttpError } from '../../errors/http-error.ts';
import { StringMarkupRenderer } from './string-markup-renderer.ts';
import { testAssetService } from './integration-renderer.test-fixtures.ts';
import {
	createDeferredIntegrationPlugin,
	createStringMarkupIntegration,
	createTestAppConfig,
	htmlDocumentHead,
	renderFilesystemPageAndExplicitView,
} from '@ecopages/testing';

const appConfig = await createFixtureAppConfig();

const metadata = {
	title: 'Ecopages',
	description: 'Ecopages',
};

const pageBody = '<body>Hello World</body>';

const TestHtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class TestStringRenderer extends StringMarkupRenderer {
	name = 'string';
	htmlTemplate: EcoComponent<HtmlTemplateProps> = TestHtmlTemplate;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}
}

const createRenderer = (config = appConfig) =>
	new TestStringRenderer({
		appConfig: config,
		assetProcessingService: testAssetService,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});

describe('StringMarkupRenderer', () => {
	it('should render the page', async () => {
		const renderer = createRenderer();

		const body = await renderer.render({
			params: {},
			query: {},
			props: {},
			file: 'file',
			metadata,
			Page: async () => pageBody,
			resolvedDependencies: [],
			HtmlTemplate,
		});

		expect(body).toContain('<!DOCTYPE html>');
		expect(body).toContain('<body>Hello World</body>');
		expect(body).toContain('<title>Ecopages</title>');
		expect(body).toContain('<meta name="description" content="Ecopages" />');
	});

	it('passes route-resolved dependency roots into the document shell', async () => {
		const renderer = createRenderer();
		const resolvedContent = (async () => '<article>Resolved content</article>') as EcoComponent;
		const renderPageShell = vi
			.spyOn(
				renderer as unknown as {
					renderPageWithDocumentShell(input: unknown): Promise<string>;
				},
				'renderPageWithDocumentShell',
			)
			.mockResolvedValue('<html><body></body></html>');

		await renderer.render({
			params: {},
			query: {},
			props: {},
			file: 'file',
			metadata,
			Page: async () => pageBody,
			resolvedDependencies: [],
			resolvedPageDependencyComponents: [resolvedContent],
			HtmlTemplate,
		});

		expect(renderPageShell).toHaveBeenCalledWith(expect.objectContaining({ foreignChildRoots: [resolvedContent] }));
	});

	it('should throw an error if the page fails to render', async () => {
		const renderer = createRenderer();

		await expect(
			renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata,
				Page: async () => {
					throw new Error('Page failed to render');
				},
				HtmlTemplate,
			}),
		).rejects.toThrow('Error rendering page: Page failed to render');
	});

	it('should preserve HttpError.NotFound thrown during page render', async () => {
		const renderer = createRenderer();
		const notFound = HttpError.NotFound('Unknown content entry');

		await expect(
			renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata,
				Page: async () => {
					throw notFound;
				},
				HtmlTemplate,
			}),
		).rejects.toBe(notFound);
	});

	it('should resolve deferred foreign layout content without unresolved eco-marker artifacts', async () => {
		const deferredPlugin = createDeferredIntegrationPlugin({
			extensions: ['.deferred.ts'],
		});
		const config = await createTestAppConfig({
			rootDir: FIXTURE_APP_PROJECT_DIR,
			integrations: [createStringMarkupIntegration({ extensions: ['.ts'] }), deferredPlugin],
			title: metadata.title,
			description: metadata.description,
		});

		const renderer = createRenderer(config);

		const DeferredWidget = eco.component<object, string>({
			integration: 'deferred',
			render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
		});
		DeferredWidget.config = {
			...DeferredWidget.config,
			identity: {
				id: 'deferred-widget',
				file: '/app/components/deferred-widget.deferred.ts',
				integration: 'deferred',
			},
		};

		const Layout = eco.layout<string>({
			dependencies: {
				components: [DeferredWidget],
			},
			render: ({ children }) => `<main class="layout">${children}${DeferredWidget({})}</main>`,
		});

		const body = await renderer.render({
			params: {},
			query: {},
			props: {},
			file: 'file',
			metadata,
			Page: async () => '<section>Page</section>',
			Layout,
			resolvedDependencies: [],
			HtmlTemplate: TestHtmlTemplate,
			pageProps: {},
		});

		expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
		expect(body).not.toContain('<eco-marker');
	});

	it('should expose the compatibility foreign-subtree payload contract', async () => {
		const renderer = createRenderer();
		const Component = (async () => '<main>Foreign Subtree</main>') as EcoComponent<Record<string, unknown>>;

		const result = toForeignSubtreeRenderPayload(
			await renderer.renderComponentWithForeignChildren({
				component: Component,
				props: {},
			}),
		);

		expect(result).toEqual<ForeignSubtreeRenderPayload>({
			html: '<main>Foreign Subtree</main>',
			assets: [],
			rootTag: 'main',
			rootAttributes: undefined,
			attachmentPolicy: { kind: 'first-element' },
			integrationName: 'string',
		});
	});

	describe('renderExplicitView', () => {
		it('should render a view with default status 200', async () => {
			const renderer = createRenderer();
			const View = (async (props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{
				title: string;
			}>;

			const response = await renderer.renderExplicitView(View, { title: 'Hello String' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			await expect(response.text()).resolves.toContain('<h1>Hello String</h1>');
		});

		it('should render a partial view without a full html wrapper', async () => {
			const renderer = createRenderer();
			const View = (async (props: { content: string }) => `<div>${props.content}</div>`) as EcoComponent<{
				content: string;
			}>;

			const response = await renderer.renderExplicitView(View, { content: 'Partial' }, { partial: true });
			const body = await response.text();

			expect(body).toBe('<div>Partial</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should render with layout when not partial', async () => {
			const renderer = createRenderer();
			const Layout = (async ({ children }: { children: string }) =>
				`<main class="layout">${children}</main>`) as EcoComponent<{ children: string }>;
			const View = (async (props: { message: string }) => `<p>${props.message}</p>`) as EcoComponent<{
				message: string;
			}>;
			View.config = { layouts: [Layout] };

			const response = await renderer.renderExplicitView(View, { message: 'With Layout' }, {});
			const body = await response.text();

			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('renders every layout, factory props, default metadata, and robots meta', async () => {
			const renderer = createRenderer();
			const Outer = (async ({ children }: { children: string }) =>
				`<div class="outer">${children}</div>`) as EcoComponent<{ children: string }>;
			const Inner = (async ({ children, label }: { children: string; label: string }) =>
				`<div class="inner" data-label="${label}">${children}</div>`) as EcoComponent<{
				children: string;
				label: string;
			}>;
			const View = (async () => `<p>About</p>`) as EcoComponent<object>;
			View.metadata = (async () => ({
				title: 'About title',
				robots: { index: false },
			})) as unknown as EcoComponent['metadata'];
			View.config = {
				layouts: [Outer, Inner],
				layoutEntries: [{ component: Outer }, { component: Inner, props: () => ({ label: 'from-factory' }) }],
			};
			renderer.htmlTemplate = (async ({ children, metadata }) =>
				`<html><head><title>${metadata.title}</title><meta name="description" content="${metadata.description}" /></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;

			const body = await (await renderer.renderExplicitView(View, {}, {})).text();

			expect(body).toContain('class="outer"');
			expect(body).toContain('data-label="from-factory"');
			expect(body).toContain('<p>About</p>');
			expect(body).toContain('About title');
			expect(body).toContain(
				'<meta name="description" content="This is a static site generated with Ecopages" />',
			);
			expect(body).toContain('<meta name="robots" content="noindex">');
		});

		it('matches the filesystem page head and layouts', async () => {
			const renderer = createRenderer();
			const Outer = (async ({ children }: { children: string }) =>
				`<div class="outer">${children}</div>`) as EcoComponent<{ children: string }>;
			const Inner = (async ({ children, label }: { children: string; label: string }) =>
				`<div class="inner" data-label="${label}">${children}</div>`) as EcoComponent<{
				children: string;
				label: string;
			}>;
			const View = (async () => `<p>About</p>`) as EcoComponent<object>;
			View.config = {
				layouts: [Outer, Inner],
				layoutEntries: [{ component: Outer }, { component: Inner, props: () => ({ label: 'from-factory' }) }],
			};
			renderer.htmlTemplate = (async ({ children, metadata }) =>
				`<html><head><title>${metadata.title}</title><meta name="description" content="${metadata.description}" /></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;

			const { pageHtml, explicitHtml } = await renderFilesystemPageAndExplicitView(
				renderer,
				View,
				{},
				'/app/pages/about.ts',
			);

			expect(htmlDocumentHead(explicitHtml)).toBe(htmlDocumentHead(pageHtml));
			expect(explicitHtml).toContain('class="outer"');
			expect(explicitHtml).toContain('data-label="from-factory"');
			expect(explicitHtml).toBe(pageHtml);
		});

		it('should throw an error if the view fails to render', async () => {
			const renderer = createRenderer();
			const View = (async () => {
				throw new Error('View failed to render');
			}) as EcoComponent<object>;

			await expect(renderer.renderExplicitView(View, {}, {})).rejects.toThrow(
				'Error rendering page: View failed to render',
			);
		});
	});
});
