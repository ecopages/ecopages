import { describe, expect, it } from 'vitest';
import HtmlTemplate from '../../../__fixtures__/app/src/includes/html.ts';
import { createFixtureAppConfig } from '../../../__fixtures__/app/test-app-config.ts';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.ts';
import { eco, type ForeignSubtreeRenderPayload, type EcoComponent, type HtmlTemplateProps } from '../../index.ts';
import { toForeignSubtreeRenderPayload } from '../../route-renderer/orchestration/foreign-child/foreign-subtree-execution.service.ts';
import { HttpError } from '../../errors/http-error.ts';
import { StringMarkupRenderer } from './string-markup-renderer.ts';
import { testAssetService } from './integration-renderer.test-fixtures.ts';
import { createDeferredIntegrationPlugin, createStringMarkupIntegration, createTestAppConfig } from '@ecopages/testing';

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
			configure: (builder) => builder.setRootDir(FIXTURE_APP_PROJECT_DIR),
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

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const renderer = createRenderer();
			const View = (async (props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{
				title: string;
			}>;

			const response = await renderer.renderToResponse(View, { title: 'Hello String' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			await expect(response.text()).resolves.toContain('<h1>Hello String</h1>');
		});

		it('should render a partial view without a full html wrapper', async () => {
			const renderer = createRenderer();
			const View = (async (props: { content: string }) => `<div>${props.content}</div>`) as EcoComponent<{
				content: string;
			}>;

			const response = await renderer.renderToResponse(View, { content: 'Partial' }, { partial: true });
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

			const response = await renderer.renderToResponse(View, { message: 'With Layout' }, {});
			const body = await response.text();

			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('should throw an error if the view fails to render', async () => {
			const renderer = createRenderer();
			const View = (async () => {
				throw new Error('View failed to render');
			}) as EcoComponent<object>;

			await expect(renderer.renderToResponse(View, {}, {})).rejects.toThrow(
				'Error rendering view: View failed to render',
			);
		});
	});
});
