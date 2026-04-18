import { describe, expect, it } from 'vitest';
import HtmlTemplate from '../../../__fixtures__/app/src/includes/html.ghtml.js';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { eco, type EcoComponent, type EcoPagesElement, type HtmlTemplateProps } from '../../index.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '../../route-renderer/orchestration/integration-renderer.ts';
import { GhtmlRenderer } from './ghtml-renderer.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const metadata = {
	title: 'Ecopages',
	description: 'Ecopages',
};

const pageBody = '<body>Hello World</body>';

const TestHtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class TestGhtmlRenderer extends GhtmlRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = TestHtmlTemplate;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}
}

const createRenderer = (config = appConfig) =>
	new TestGhtmlRenderer({
		appConfig: config,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});

class DeferredRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'deferred';

	async render(): Promise<string> {
		return '';
	}

	override async renderComponent() {
		return {
			html: '<button data-testid="deferred-widget">Deferred widget</button>',
			canAttachAttributes: true,
			rootTag: 'button',
			integrationName: this.name,
		};
	}

	async renderToResponse<P = Record<string, unknown>>(
		_view: EcoComponent<P>,
		_props: P,
		_ctx: RenderToResponseContext,
	) {
		return new Response('');
	}
}

class DeferredPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer = DeferredRenderer;

	constructor() {
		super({
			name: 'deferred',
			extensions: ['.deferred.ts'],
		});
	}
}

describe('GhtmlRenderer', () => {
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

	it('should resolve deferred foreign layout content without unresolved boundary artifacts', async () => {
		const deferredPlugin = new DeferredPlugin();
		const config = await new ConfigBuilder()
			.setRootDir(FIXTURE_APP_PROJECT_DIR)
			.setRobotsTxt({
				preferences: {
					'*': [],
				},
			})
			.setIntegrations([deferredPlugin])
			.setDefaultMetadata(metadata)
			.setBaseUrl('http://localhost:3000')
			.build();

		deferredPlugin.setConfig(config);
		deferredPlugin.setRuntimeOrigin('http://localhost:3000');

		const renderer = createRenderer(config);

		const DeferredWidget = eco.component<{}, string>({
			integration: 'deferred',
			render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
		});
		DeferredWidget.config = {
			...DeferredWidget.config,
			__eco: {
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

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const renderer = createRenderer();
			const View = (async (props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{ title: string }>;

			const response = await renderer.renderToResponse(View, { title: 'Hello Ghtml' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			await expect(response.text()).resolves.toContain('<h1>Hello Ghtml</h1>');
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
			View.config = { layout: Layout };

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
