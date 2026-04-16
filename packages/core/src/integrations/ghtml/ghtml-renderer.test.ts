import { describe, expect, it } from 'vitest';
import HtmlTemplate from '../../../__fixtures__/app/src/includes/html.ghtml.js';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { eco, type EcoComponent, type EcoPagesElement, type HtmlTemplateProps } from '../../index.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import { IntegrationRenderer, type RenderToResponseContext } from '../../route-renderer/orchestration/integration-renderer.ts';
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

const rendererContext = {
	appConfig,
} as unknown as any;

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
		const renderer = new GhtmlRenderer(rendererContext);

		renderer
			.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				metadata,
				Page: async () => pageBody,
				resolvedDependencies: [],
				HtmlTemplate,
			})
			.then((body) => {
				expect(body).toContain('<!DOCTYPE html>');
				expect(body).toContain('<body>Hello World</body>');
				expect(body).toContain('<title>Ecopages</title>');
				expect(body).toContain('<meta name="description" content="Ecopages" />');
			});
	});

	it('should throw an error if the page fails to render', async () => {
		const renderer = new GhtmlRenderer(rendererContext);

		renderer
			.render({
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
			})
			.catch((error) => {
				expect(error.message).toBe('Error rendering page: Page failed to render');
			});
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

		const renderer = new GhtmlRenderer({
			appConfig: config,
			assetProcessingService: {} as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

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
});
