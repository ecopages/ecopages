import { describe, expect, it, vi } from 'vitest';
import { eco, type ComponentRenderInput, type EcoComponent, type EcoPagesElement, type HtmlTemplateProps } from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { LitElement, html as litHtml } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { html as staticHtml } from 'lit/static-html.js';
import { LitRenderer } from '../lit-renderer.ts';

let customElementIndex = 0;

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

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class TestLitRenderer extends LitRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate;
	preloadedComponentBatches: Array<Array<EcoComponent | undefined>> = [];

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}

	protected override async preloadSsrLazyScripts(components: Array<EcoComponent | undefined>): Promise<void> {
		this.preloadedComponentBatches.push(components);
	}
}

const createRenderer = () => {
	return new TestLitRenderer({
		appConfig: Config,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
};

const createRendererWithAssets = () => {
	const assetProcessingService = {
		processDependencies: vi.fn(async () => [
			{
				kind: 'script',
				srcUrl: '/assets/island.js',
				position: 'head',
			},
		]),
	};

	const renderer = new TestLitRenderer({
		appConfig: Config,
		assetProcessingService: assetProcessingService as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
	return { renderer, assetProcessingService };
};

const renderer = new LitRenderer({
	appConfig: Config,
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

describe('LitRenderer', () => {
	describe('renderComponent', () => {
		it('should render a single component with structured output', async () => {
			const testRenderer = createRenderer();
			const Component = (async (props: { label: string }) =>
				`<section>${props.label}</section>`) as unknown as EcoComponent<{ label: string }>;

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { label: 'Lit Component' },
			});

			expect(result.integrationName).toBe('lit');
			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootTag).toBe('section');
			expect(result.html).toContain('<section>Lit Component</section>');
		});

		it('should SSR registered custom elements from string markup', async () => {
			const testRenderer = createRenderer();
			const tagName = `lit-ssr-test-${++customElementIndex}`;

			class TestCounterElement extends LitElement {
				static override properties = {
					count: { type: Number },
				};

				count = 0;

				override render() {
					return litHtml`<span data-lit-value>${this.count}</span>`;
				}
			}

			customElements.define(tagName, TestCounterElement);

			const Component = (() => `<${tagName} count="3"></${tagName}>`) as unknown as EcoComponent<object>;

			const result = await testRenderer.renderComponent({
				component: Component,
				props: {},
			});

			expect(result.html).toContain(`<${tagName}`);
			expect(result.html).toContain('count="3"');
			expect(result.html).toContain('<template shadowrootmode="open">');
			expect(result.html).toContain('data-lit-value');
			expect(result.html).toContain('<!--lit-part-->3<!--/lit-part-->');
		});

		it('should not rerender serialized children passed into a lit component boundary', async () => {
			const testRenderer = createRenderer();
			const tagName = `lit-shell-test-${++customElementIndex}`;

			class TestShellElement extends LitElement {
				static override properties = {
					count: { type: Number },
				};

				count = 0;

				override render() {
					return litHtml`<span data-lit-value>${this.count}</span>`;
				}
			}

			customElements.define(tagName, TestShellElement);
			const childResult = await testRenderer.renderComponent({
				component: (() => `<${tagName} count="5"></${tagName}>`) as unknown as EcoComponent<object>,
				props: {},
			});

			const Shell = ((props: { children?: string }) =>
				litHtml`<section class="shell">${props.children ? unsafeHTML(props.children) : ''}</section>`) as unknown as EcoComponent<{
				children?: string;
			}>;

			const result = await testRenderer.renderComponent({
				component: Shell,
				props: {},
				children: childResult.html,
			});

			expect(result.html).toContain('<section class="shell">');
			expect(result.html.match(new RegExp(`<${tagName}`, 'g'))?.length).toBe(1);
			expect(result.html.match(/<template shadowrootmode="open">/g)?.length).toBe(1);
			expect(result.html).toContain('<!--lit-part-->5<!--/lit-part-->');
		});

		it('should inject non-string children inside the lit component boundary', async () => {
			const testRenderer = createRenderer();
			const Shell = ((props: { children?: string }) =>
				litHtml`<section class="shell"><div class="shell__body">${props.children ? unsafeHTML(props.children) : ''}</div></section>`) as unknown as EcoComponent<{
				children?: string;
			}>;

			const result = await testRenderer.renderComponent({
				component: Shell,
				props: {},
				children: litHtml`<div data-child-group><span data-child-value>0</span></div>`,
			});

			expect(result.html).toContain('<section class="shell">');
			expect(result.html).toContain('<div class="shell__body">');
			expect(result.html).toContain('data-child-group');
			expect(result.html).not.toContain('eco-lit-component-children');
			expect(result.html.indexOf('data-child-group')).toBeGreaterThan(
				result.html.indexOf('<div class="shell__body">'),
			);
			expect(result.html.indexOf('data-child-group')).toBeLessThan(result.html.indexOf('</section>'));
		});

		it('should inject serialized children when the lit shell interpolates children directly', async () => {
			const testRenderer = createRenderer();
			const tagName = `lit-direct-child-test-${++customElementIndex}`;

			class TestDirectChildElement extends LitElement {
				static override properties = {
					count: { type: Number },
				};

				count = 0;

				override render() {
					return litHtml`<span data-lit-value>${this.count}</span>`;
				}
			}

			customElements.define(tagName, TestDirectChildElement);
			const childResult = await testRenderer.renderComponent({
				component: (() => `<${tagName} count="7"></${tagName}>`) as unknown as EcoComponent<object>,
				props: {},
			});

			const Shell = ((props: { children?: string }) =>
				litHtml`<section class="shell"><div class="shell__body">${props.children ?? ''}</div></section>`) as unknown as EcoComponent<{
				children?: string;
			}>;

			const result = await testRenderer.renderComponent({
				component: Shell,
				props: {},
				children: childResult.html,
			});

			expect(result.html).toContain('<section class="shell">');
			expect(result.html).toContain('<div class="shell__body">');
			expect(result.html.match(new RegExp(`<${tagName}`, 'g'))?.length).toBe(1);
			expect(result.html).toContain('<!--lit-part-->7<!--/lit-part-->');
			expect(result.html).not.toContain('eco-lit-component-children');
			expect(result.html).not.toContain('&lt;!--eco-lit-component-children--&gt;');
		});

		it('should inject serialized children into every repeated lit child slot marker', async () => {
			const testRenderer = createRenderer();
			const tagName = `lit-repeated-child-test-${++customElementIndex}`;

			class TestRepeatedChildElement extends LitElement {
				static override properties = {
					count: { type: Number },
				};

				count = 0;

				override render() {
					return litHtml`<span data-lit-value>${this.count}</span>`;
				}
			}

			customElements.define(tagName, TestRepeatedChildElement);
			const childResult = await testRenderer.renderComponent({
				component: (() => `<${tagName} count="9"></${tagName}>`) as unknown as EcoComponent<object>,
				props: {},
			});

			const Shell = ((props: { children?: string }) =>
				litHtml`
					<section class="shell">
						<div class="shell__body">${props.children ?? ''}</div>
						<footer class="shell__footer">${props.children ?? ''}</footer>
					</section>
				`) as unknown as EcoComponent<{
				children?: string;
			}>;

			const result = await testRenderer.renderComponent({
				component: Shell,
				props: {},
				children: childResult.html,
			});

			expect(result.html.match(new RegExp(`<${tagName}`, 'g'))?.length).toBe(2);
			expect(result.html.match(/<!--lit-part-->9<!--\/lit-part-->/g)?.length).toBe(2);
			expect(result.html).not.toContain('eco-lit-component-children');
			expect(result.html).not.toContain('&lt;!--eco-lit-component-children--&gt;');
		});

		it('should preload SSR lazy scripts before component-level renders', async () => {
			const testRenderer = createRenderer();
			const Component = (() => '<lit-counter count="0"></lit-counter>') as unknown as EcoComponent<object>;
			Component.config = {
				__eco: {
					id: 'lit-counter',
					file: '/project/src/components/lit-counter.lit.tsx',
					integration: 'lit',
				},
				dependencies: {
					scripts: [
						{
							src: './lit-counter.script.ts',
							lazy: { 'on:interaction': 'click' },
							ssr: true,
						},
					],
				},
			};

			await testRenderer.renderComponent({
				component: Component,
				props: {},
			});

			expect(testRenderer.preloadedComponentBatches).toEqual([[Component]]);
		});

		it('should include component assets when dependencies are declared', async () => {
			const { renderer, assetProcessingService } = createRendererWithAssets();
			const Component = (async (props: { label: string }) =>
				`<section>${props.label}</section>`) as unknown as EcoComponent<{ label: string }>;
			Component.config = {
				__eco: {
					id: 'lit-comp',
					file: '/project/src/components/lit-comp.lit.ts',
					integration: 'lit',
				},
				dependencies: {
					scripts: ['./lit-comp.script.ts'],
				},
			};

			const result = await renderer.renderComponent({
				component: Component,
				props: { label: 'Lit Assets' },
			});

			expect(assetProcessingService.processDependencies).toHaveBeenCalled();
			expect(result.assets).toBeDefined();
			expect(result.assets?.[0]?.srcUrl).toBe('/assets/island.js');
		});

		it('should resolve foreign boundaries inside the lit renderer and bubble nested assets', async () => {
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
						content: 'console.log("deferred")',
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
						extensions: ['.deferred.ts'],
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

			const testRenderer = new TestLitRenderer({
				appConfig: config,
				assetProcessingService: {} as any,
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
					file: '/app/components/deferred-widget.deferred.ts',
					integration: 'deferred',
				},
			};

			const Shell = eco.component<{ children?: unknown }, string>({
				integration: 'lit',
				dependencies: {
					components: [DeferredWidget],
				},
				render: ({ children }) =>
					litHtml`<main>${children ? unsafeHTML(String(children)) : ''}${unsafeHTML(String(DeferredWidget({})))}</main>` as unknown as string,
			});

			const result = await testRenderer.renderComponentBoundary({
				component: Shell,
				props: {},
				children: '<section>Host child</section>',
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

	describe('ssr lazy preload', () => {
		it('should collect nested lazy script entries for SSR preload when ssr is true', () => {
			const testRenderer = createRenderer();
			const nested = (() => '<div>Nested</div>') as unknown as EcoComponent<object>;
			nested.config = {
				__eco: {
					id: 'nested',
					file: '/project/src/components/nested.lit.tsx',
					integration: 'lit',
				},
				dependencies: {
					scripts: [{ src: './nested.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
				},
			};

			const view = (() => '<div>View</div>') as unknown as EcoComponent<object>;
			view.config = {
				__eco: {
					id: 'view',
					file: '/project/src/pages/index.lit.tsx',
					integration: 'lit',
				},
				dependencies: {
					components: [nested],
					scripts: [{ src: './view.script.ts', lazy: { 'on:idle': true }, ssr: true }],
				},
			};

			const scripts = (testRenderer as any).collectSsrPreloadScripts([view]);

			expect(scripts).toContain('/project/src/pages/view.script.ts');
			expect(scripts).toContain('/project/src/components/nested.script.ts');
		});

		it('should skip lazy scripts from SSR preload when ssr is not true', () => {
			const testRenderer = createRenderer();
			const view = (() => '<div>View</div>') as unknown as EcoComponent<object>;
			view.config = {
				__eco: {
					id: 'view',
					file: '/project/src/pages/index.lit.tsx',
					integration: 'lit',
				},
				dependencies: {
					scripts: [{ src: './view.script.ts', lazy: { 'on:idle': true }, ssr: false }],
				},
			};

			const scripts = (testRenderer as any).collectSsrPreloadScripts([view]);

			expect(scripts).toEqual([]);
		});

		it('should collect object-entry lazy scripts when ssr is true', () => {
			const testRenderer = createRenderer();
			const view = (() => '<div>View</div>') as unknown as EcoComponent<object>;
			view.config = {
				__eco: {
					id: 'view',
					file: '/project/src/pages/index.lit.tsx',
					integration: 'lit',
				},
				dependencies: {
					scripts: [
						{
							src: './view.script.ts',
							lazy: { 'on:interaction': 'click' },
							ssr: true,
						},
					],
				},
			};

			const scripts = (testRenderer as any).collectSsrPreloadScripts([view]);

			expect(scripts).toEqual(['/project/src/pages/view.script.ts']);
		});
	});

	describe('render', () => {
		it('should render the page', async () => {
			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<div>Hello World</div>',
				HtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<!DOCTYPE html>');
			expect(text).toContain('<div>Hello World</div>');
		});

		it('should render the page with layout', async () => {
			const Layout: EcoComponent<{ children: string }> = ({ children }) =>
				`<main class="layout">${children}</main>`;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<div>Content</div>',
				Layout,
				HtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<main class="layout">');
			expect(text).toContain('<div>Content</div>');
		});

		it('should fall back to injecting rendered children before the closing body tag', async () => {
			const LitHtmlTemplate = Object.assign(async () => '<html><body class="shell"></body></html>', {
				config: { integration: 'lit' },
			}) as EcoComponent<HtmlTemplateProps>;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<div>Content</div>',
				HtmlTemplate: LitHtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<body class="shell">');
			expect(text).toContain('<div>Content</div>');
			expect(text).not.toContain('undefined');
			expect(text).not.toContain('<--content-->');
		});

		it('should serialize lit page output before passing it to a non-lit layout', async () => {
			const Layout: EcoComponent<{ children: string }> = ({ children }) =>
				`<main class="layout">${children}</main>`;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () =>
					staticHtml`<section data-testid="lit-page">Lit content</section>` as unknown as string,
				Layout,
				HtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<main class="layout">');
			expect(text).toContain('data-testid="lit-page"');
			expect(text).not.toContain('<--content-->');
		});

		it('should render lit page output inside a non-lit html template without leaving the slot marker behind', async () => {
			const NonLitHtmlTemplate = Object.assign(
				async ({ children }: HtmlTemplateProps) =>
					`<html><body><main class="shell">${children}</main></body></html>`,
				{
					config: {
						__eco: {
							integration: 'ghtml',
						},
					},
				},
			) as EcoComponent<HtmlTemplateProps>;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () =>
					staticHtml`<section data-testid="lit-page">Lit content</section>` as unknown as string,
				HtmlTemplate: NonLitHtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<main class="shell">');
			expect(text).toContain('data-testid="lit-page"');
			expect(text).not.toContain('<--content-->');
		});

		it('should pass rendered children directly to non-lit html templates', async () => {
			const NonLitHtmlTemplate = Object.assign(
				async ({ children }: HtmlTemplateProps) => `<html><body>${String(children)}</body></html>`,
				{
					config: {
						__eco: {
							integration: 'ghtml',
						},
					},
				},
			) as EcoComponent<HtmlTemplateProps>;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<div>Content</div>',
				HtmlTemplate: NonLitHtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<div>Content</div>');
			expect(text.indexOf('<div>Content</div>')).toBeGreaterThan(text.indexOf('<body>'));
			expect(text.indexOf('<div>Content</div>')).toBeLessThan(text.indexOf('</body>'));
			expect(text).not.toContain('eco-lit-component-children');
			expect(text).not.toContain('<--content-->');
		});

		it('should pass rendered children directly to a non-lit html template that wraps them', async () => {
			const NonLitHtmlTemplate = Object.assign(
				async ({ children }: HtmlTemplateProps) =>
					`<html><body><main class="shell">${String(children)}</main></body></html>`,
				{
					config: {
						__eco: {
							integration: 'ghtml',
						},
					},
				},
			) as EcoComponent<HtmlTemplateProps>;

			const body = await renderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<lit-counter count="1"></lit-counter>',
				HtmlTemplate: NonLitHtmlTemplate,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text.match(/<lit-counter/g)?.length).toBe(1);
			expect(text).toContain('<main class="shell">');
			expect(text).not.toContain('eco-lit-component-children');
			expect(text).not.toContain('<--content-->');
		});

		it('should throw an error if the page fails to render', async () => {
			await expect(
				renderer.render({
					params: {},
					query: {},
					props: {},
					file: 'file',
					resolvedDependencies: [],
					metadata: {
						title: 'Hello World',
						description: 'Hello World',
					},
					Page: async () => {
						throw new Error('Page failed to render');
					},
					HtmlTemplate,
				}),
			).rejects.toThrow('Error rendering page: Page failed to render');
		});

		it('should resolve deferred cross-integration layout components without leaving markers behind', async () => {
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

			const testRenderer = new LitRenderer({
				appConfig: config,
				assetProcessingService: {} as any,
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
					file: '/app/components/deferred-widget.deferred.ts',
					integration: 'deferred',
				},
			};

			const Layout = eco.layout<string>({
				integration: 'lit',
				dependencies: {
					components: [DeferredWidget],
				},
				render: ({ children }) =>
					litHtml`<main>${children ? unsafeHTML(children) : ''}${unsafeHTML(String(DeferredWidget({})))}</main>` as unknown as string,
			});

			const Page = eco.page({
				integration: 'lit',
				layout: Layout,
				render: () => '<section>Route page</section>',
			});

			const body = await testRenderer.render({
				params: {},
				query: {},
				props: {},
				file: '/app/pages/index.lit.ts',
				resolvedDependencies: [],
				metadata: {
					title: 'Route page',
					description: 'Route page',
				},
				Page,
				Layout,
				HtmlTemplate,
				pageProps: {},
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<section>Route page</section>');
			expect(text).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
			expect(text).not.toContain('<eco-marker');
		});
	});

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const testRenderer = createRenderer();
			const View = (async (props: { title: string }) => `<h1>${props.title}</h1>`) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderToResponse(View, { title: 'Hello' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello</h1>');
		});

		it('should render a partial view without layout', async () => {
			const testRenderer = createRenderer();
			const View = (async (props: { content: string }) =>
				`<div>${props.content}</div>`) as unknown as EcoComponent<{ content: string }>;

			const response = await testRenderer.renderToResponse(View, { content: 'Partial' }, { partial: true });

			const body = await response.text();
			expect(body).toContain('<div>Partial</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Not Found</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(View, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Cached</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(
				View,
				{},
				{
					headers: {
						'Cache-Control': 'max-age=3600',
						'X-Custom-Header': 'test-value',
					},
				},
			);

			expect(response.headers.get('Cache-Control')).toBe('max-age=3600');
			expect(response.headers.get('X-Custom-Header')).toBe('test-value');
		});

		it('should render with layout when not partial', async () => {
			const testRenderer = createRenderer();
			const Layout = ((props: { children: string }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: string }>;

			const View = (async (props: { message: string }) => `<p>${props.message}</p>`) as unknown as EcoComponent<{
				message: string;
			}>;
			View.config = { layout: Layout };

			const response = await testRenderer.renderToResponse(View, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('<main class="layout">');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('should not route full view rendering through capture-plus-finalize', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Explicit</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(View, {}, {});
			const body = await response.text();

			expect(body).toContain('<p>Explicit</p>');
		});

		it('should not append undefined when the html template omits the slot marker', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Fallback</p>') as unknown as EcoComponent<object>;
			const LitHtmlTemplate = Object.assign(async () => '<html><body class="shell"></body></html>', {
				config: { integration: 'lit' },
			}) as EcoComponent<HtmlTemplateProps>;

			testRenderer.htmlTemplate = LitHtmlTemplate;

			const response = await testRenderer.renderToResponse(View, {}, {});
			const body = await response.text();

			expect(body).toContain('<body class="shell">');
			expect(body).toContain('<p>Fallback</p>');
			expect(body).not.toContain('undefined');
			expect(body).not.toContain('<--content-->');
		});

		it('should serialize lit view output before passing it to a non-lit layout', async () => {
			const testRenderer = createRenderer();
			const Layout = ((props: { children: string }) =>
				`<main class="layout">${props.children}</main>`) as EcoComponent<{ children: string }>;
			const View = (async () =>
				staticHtml`<section data-testid="lit-view">Lit view</section>`) as unknown as EcoComponent<object>;
			View.config = { layout: Layout };

			const response = await testRenderer.renderToResponse(View, {}, {});
			const body = await response.text();

			expect(body).toContain('<main class="layout">');
			expect(body).toContain('data-testid="lit-view"');
			expect(body).not.toContain('<--content-->');
		});

		it('should render lit view output inside a non-lit html template without leaving the slot marker behind', async () => {
			const testRenderer = createRenderer();
			const View = (async () =>
				staticHtml`<section data-testid="lit-view">Lit view</section>`) as unknown as EcoComponent<object>;
			const NonLitHtmlTemplate = (async ({ children }: HtmlTemplateProps) =>
				`<html><body><main class="shell">${children}</main></body></html>`) as EcoComponent<HtmlTemplateProps>;

			testRenderer.htmlTemplate = NonLitHtmlTemplate;

			const response = await testRenderer.renderToResponse(View, {}, {});
			const body = await response.text();

			expect(body).toContain('<main class="shell">');
			expect(body).toContain('data-testid="lit-view"');
			expect(body).not.toContain('<--content-->');
		});

		it('should pass rendered children directly to non-lit html templates', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Fallback</p>') as unknown as EcoComponent<object>;
			const NonLitHtmlTemplate = Object.assign(
				async ({ children }: HtmlTemplateProps) => `<html><body>${String(children)}</body></html>`,
				{
					config: {
						__eco: {
							integration: 'ghtml',
						},
					},
				},
			) as EcoComponent<HtmlTemplateProps>;

			testRenderer.htmlTemplate = NonLitHtmlTemplate;

			const response = await testRenderer.renderToResponse(View, {}, {});
			const body = await response.text();

			expect(body).toContain('<p>Fallback</p>');
			expect(body).not.toContain('<--content-->');
		});

		it('should throw an error if the view fails to render', async () => {
			const testRenderer = createRenderer();
			const View = (async () => {
				throw new Error('View failed to render');
			}) as unknown as EcoComponent<object>;

			await expect(testRenderer.renderToResponse(View, {}, {})).rejects.toThrow(
				'Error rendering view: View failed to render',
			);
		});
	});
});
