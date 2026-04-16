/** @jsxImportSource @ecopages/jsx */
import { describe, expect, it, vi } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import {
	eco,
	type ComponentRenderInput,
	type EcoComponent,
	type EcoPagesElement,
	type HtmlTemplateProps,
} from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';

const Config = await new ConfigBuilder()
	.setRobotsTxt({
		preferences: {
			'*': [],
		},
	})
	.setIntegrations([])
	.setDefaultMetadata({
		title: 'Ecopages',
		description: 'Ecopages',
	})
	.setBaseUrl('http://localhost:3000')
	.build();

const HtmlTemplate = ({ children }: { children: JsxRenderable }) => {
	return (
		<html>
			<body>
				<main data-document-root>{children}</main>
			</body>
		</html>
	);
};

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
	}

	protected override async resolveDependencies(): Promise<[]> {
		return [];
	}
}

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
			extensions: ['.deferred.tsx'],
		});
	}
}

describe('EcopagesJsxRenderer', () => {
	describe('renderComponent', () => {
		it('returns component-scoped dependency assets for component boundary renders', async () => {
			const processDependencies = vi.fn(async () => [
				{
					kind: 'script',
					srcUrl: '/assets/component.js',
					position: 'head',
				},
			]);
			const renderer = new EcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies,
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const Component = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					scripts: ['./component.script.ts'],
				},
				render: () => <section data-component-root>ready</section>,
			});

			const result = await renderer.renderComponent({
				component: Component,
				props: {},
			});

			expect(processDependencies).toHaveBeenCalled();
			expect(result.html).toContain('data-component-root');
			expect(result.assets).toEqual([
				{
					kind: 'script',
					srcUrl: '/assets/component.js',
					position: 'head',
				},
			]);
		});

		it('resolves foreign boundaries inside the JSX renderer and bubbles nested assets', async () => {
			const deferredRenderComponent = vi.fn(async (input: ComponentRenderInput) => ({
				html: '<button data-testid="deferred-widget">Deferred widget</button>',
				canAttachAttributes: true,
				rootTag: 'button',
				integrationName: 'deferred',
				rootAttributes: {
					'data-eco-component-id':
						(input.integrationContext as { componentInstanceId?: string } | undefined)?.componentInstanceId ??
						'missing',
				},
				assets: [
					{
						kind: 'script',
						inline: true,
						content: 'console.log("deferred-jsx")',
						position: 'body',
					},
				],
			}));

			class DeferredBoundaryRenderer extends IntegrationRenderer<EcoPagesElement> {
				name = 'deferred';

				async render(): Promise<string> {
					return '';
				}

				override async renderComponent(input: ComponentRenderInput) {
					return deferredRenderComponent(input);
				}

				async renderToResponse<P = Record<string, unknown>>(
					_view: EcoComponent<P>,
					_props: P,
					_ctx: RenderToResponseContext,
				) {
					return new Response('');
				}
			}

			class DeferredBoundaryPlugin extends IntegrationPlugin<EcoPagesElement> {
				renderer = DeferredBoundaryRenderer;

				constructor() {
					super({
						name: 'deferred',
						extensions: ['.deferred.tsx'],
					});
				}
			}

			const deferredPlugin = new DeferredBoundaryPlugin();
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([deferredPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			deferredPlugin.setConfig(config);
			deferredPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredWidget = eco.component({
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});
			DeferredWidget.config = {
				...DeferredWidget.config,
				__eco: {
					id: 'deferred-widget',
					file: '/app/components/deferred-widget.deferred.tsx',
					integration: 'deferred',
				},
			};

			const Shell = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [DeferredWidget],
				},
				render: (_props) => (
					<main>
						<section>Host child</section>
						<DeferredWidget />
					</main>
				),
			});

			const result = await renderer.renderComponentBoundary({
				component: Shell,
				props: {},
				integrationContext: {
					componentInstanceId: 'host',
				},
			});

			expect(result.html).toContain('<section>Host child</section>');
			expect(result.html).toContain('<button data-eco-component-id="host_n_1" data-testid="deferred-widget">Deferred widget</button>');
			expect(result.html).not.toContain('<eco-marker');
			expect(result.assets).toEqual([
				expect.objectContaining({
					kind: 'script',
					inline: true,
					position: 'body',
				}),
			]);
			expect(deferredRenderComponent).toHaveBeenCalledTimes(1);
		});
	});

	describe('renderToResponse', () => {
		it('renders full route pages through renderer-owned explicit boundary renders', async () => {
			const deferredPlugin = new DeferredPlugin();
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([deferredPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			deferredPlugin.setConfig(config);
			deferredPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredWidget = eco.component({
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});
			DeferredWidget.config = {
				...DeferredWidget.config,
				__eco: {
					id: 'deferred-widget',
					file: '/app/components/deferred-widget.deferred.tsx',
					integration: 'deferred',
				},
			};

			const Layout = eco.layout<JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [DeferredWidget],
				},
				render: ({ children }) => (
					<main data-layout-root>
						{children}
						<DeferredWidget />
					</main>
				),
			});

			const Page = eco.page<{ label: string }, JsxRenderable>({
				integration: 'ecopages-jsx',
				layout: Layout,
				render: ({ label }) => <section data-view-root>{label}</section>,
			});

			const body = await renderer.render({
				params: {},
				query: {},
				props: { label: 'Route page' },
				file: '/app/pages/index.tsx',
				resolvedDependencies: [],
				metadata: {
					title: 'Route page',
					description: 'Route page',
				},
				Page: Page as EcoComponent<Record<string, unknown>, JsxRenderable>,
				Layout: Layout as unknown as EcoComponent<Record<string, unknown>, JsxRenderable>,
				HtmlTemplate: HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>,
				pageProps: { label: 'Route page' },
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<!DOCTYPE html>');
			expect(text).toContain('data-view-root="true">Route page</section>');
			expect(text).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
			expect(text).not.toContain('<eco-marker');
		});

		it('renders partial JSX views without routing through a document shell', async () => {
			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const View = eco.page<{ label: string }, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: ({ label }) => <section data-view-root>{label}</section>,
			});

			const response = await renderer.renderToResponse(View, { label: 'Ready' }, { partial: true });
			const body = await response.text();

			expect(body).toContain('data-view-root');
			expect(body).toContain('Ready');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('renders full JSX views through renderer-owned explicit boundary renders', async () => {
			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const Layout = eco.layout<JsxRenderable>({
				integration: 'ecopages-jsx',
				render: ({ children }) => <div data-layout-root>{children}</div>,
			});

			const View = eco.page<{ label: string }, JsxRenderable>({
				integration: 'ecopages-jsx',
				layout: Layout,
				render: ({ label }) => <section data-view-root>{label}</section>,
			});

			const response = await renderer.renderToResponse(View, { label: 'Ready' }, { partial: false });
			const body = await response.text();

			expect(body).toContain('<!DOCTYPE html>');
			expect(body).toContain(
				'<main data-document-root="true"><div data-layout-root="true"><section data-view-root="true">Ready</section></div></main>',
			);
			expect(body).not.toContain('&lt;section');
		});
	});
});
