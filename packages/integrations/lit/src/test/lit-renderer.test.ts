import { describe, expect, it, vi } from 'vitest';
import {
	buildIslandHostAttributes,
	eco,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type HtmlTemplateProps,
	type RequestLocals,
} from '@ecopages/core';
import { createDeferredIntegrationPlugin, createTestAppConfig } from '@ecopages/testing';
import { createStringMarkupContractFactories, describeRendererContract } from '@ecopages/testing/renderer-contract';
import { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import { IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { LitElement, html as litHtml } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { html as staticHtml } from 'lit/static-html.js';
import { LitRenderer } from '../lit-renderer.ts';
import type { LitStaticRenderSession } from '../lit-static-render-session.ts';

let customElementIndex = 0;

const Config = await createTestAppConfig();

function createTestAssetProcessingService(appConfig: typeof Config): AssetProcessingService {
	const service = new AssetProcessingService(appConfig);
	vi.spyOn(service, 'processDependencies').mockResolvedValue([]);
	return service;
}

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class TestLitRenderer extends LitRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate;
	preloadedComponentBatches: Array<Array<EcoComponent | undefined>> = [];

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}

	protected override async preloadSsrScripts(components: Array<EcoComponent | undefined>): Promise<void> {
		this.preloadedComponentBatches.push(components);
	}
}

const createRenderer = () => {
	return new TestLitRenderer({
		appConfig: Config,
		assetProcessingService: createTestAssetProcessingService(Config),
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
};

const renderer = new LitRenderer({
	appConfig: Config,
	assetProcessingService: createTestAssetProcessingService(Config),
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

describeRendererContract({
	name: 'lit',
	errorPrefix: 'Error rendering page',
	viewFile: '/app/pages/contract.lit.ts',
	...createStringMarkupContractFactories('lit'),
	async createRenderer({ integrations, processDependencies }) {
		const testRenderer = new TestLitRenderer({
			appConfig: await createTestAppConfig({ integrations }),
			assetProcessingService: { processDependencies } as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = (async ({ children, metadata }) =>
			`<html><head><title>${metadata.title}</title></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		return testRenderer;
	},
});

describe('LitRenderer', () => {
	describe('renderComponent', () => {
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

		it('should not rerender serialized children passed into a Lit-owned foreign subtree', async () => {
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

		it('should inject non-string children inside the Lit-owned foreign subtree', async () => {
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
				identity: {
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

		it('should not stamp a script-less lit component as an island host when it wraps a foreign island with its own script', async () => {
			const deferredPlugin = createDeferredIntegrationPlugin({
				extensions: ['.deferred.ts'],
				renderComponent: async (input: ComponentRenderInput): Promise<ComponentRenderResult> => ({
					html: '<button data-testid="deferred-island">Deferred island</button>',
					canAttachAttributes: true,
					rootTag: 'button',
					integrationName: 'deferred',
					rootAttributes: buildIslandHostAttributes({
						integrationName: 'deferred',
						componentInstanceId:
							(input.integrationContext as { componentInstanceId?: string } | undefined)
								?.componentInstanceId ?? 'missing',
					}),
					assets: [
						{
							kind: 'script' as const,
							inline: true,
							content: 'console.log("deferred island")',
							position: 'body' as const,
						},
					],
				}),
			});
			const config = await createTestAppConfig({ integrations: [deferredPlugin] });
			deferredPlugin.setConfig(config);
			deferredPlugin.setRuntimeOrigin('http://localhost:3000');

			const processDependencies = vi.fn(async (dependencies: Array<{ kind: string }>) => dependencies);
			const testRenderer = new TestLitRenderer({
				appConfig: config,
				assetProcessingService: { processDependencies } as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const DeferredIsland = eco.component({
				identity: {
					id: 'deferred-island',
					file: '/app/components/deferred-island.deferred.ts',
					integration: 'deferred',
				},
				integration: 'deferred',
				dependencies: {
					scripts: ['./deferred-island.script.ts'],
				},
				render: () => '<button data-testid="deferred-island">Deferred island</button>',
			});

			const Wrapper = eco.component<object, string>({
				identity: {
					id: 'lit-wrapper',
					file: '/app/components/lit-wrapper.lit.ts',
					integration: 'lit',
				},
				integration: 'lit',
				dependencies: {
					components: [DeferredIsland],
				},
				render: () => litHtml`<main>${unsafeHTML(String(DeferredIsland({})))}</main>` as unknown as string,
			});

			const result = await testRenderer.renderComponentWithForeignChildren({
				component: Wrapper,
				props: {},
				integrationContext: { componentInstanceId: 'wrapper' },
			});

			expect(processDependencies).toHaveBeenCalled();
			expect(result.assets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: 'script', content: 'console.log("deferred island")' }),
					expect.objectContaining({
						kind: 'script',
						filepath: expect.stringContaining('deferred-island.script.ts'),
					}),
				]),
			);
			expect(result.rootAttributes?.['data-eco-island']).toBeUndefined();
			expect(result.rootAttributes?.['data-eco-island-integration']).toBeUndefined();
			expect(result.html).toMatch(/<button[^>]*\sdata-eco-island-integration="deferred"/);
			expect(result.html).not.toContain('data-eco-island-integration="lit"');
		});
	});

	describe('ssr lazy preload', () => {
		it('should collect nested lazy script entries for SSR preload when ssr is true', () => {
			const testRenderer = createRenderer();
			const nested = (() => '<div>Nested</div>') as unknown as EcoComponent<object>;
			nested.config = {
				identity: {
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
				identity: {
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
				identity: {
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
				identity: {
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

		it('gives a static page the locals proxy instead of undefined locals', async () => {
			const pageLocals = new Proxy(
				{},
				{
					get() {
						throw new Error('locals proxy');
					},
				},
			) as RequestLocals;

			await expect(
				renderer.render({
					params: {},
					query: {},
					props: {},
					locals: undefined,
					pageLocals,
					pageProps: {},
					file: '/app/pages/index.lit.tsx',
					resolvedDependencies: [],
					metadata: {
						title: 'Hello World',
						description: 'Hello World',
					},
					Page: async (props) => `<p>${(props.locals as { user: string }).user}</p>`,
					HtmlTemplate,
				}),
			).rejects.toThrow('Error rendering page: locals proxy');
		});

		it('forwards resolved page props to the document shell', async () => {
			const Shell = (async ({ children, pageProps }) =>
				`<html><body><h1>${String(pageProps.title)}</h1>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;

			const body = await renderer.render({
				params: {},
				query: {},
				props: { title: 'Handler' },
				pageProps: { title: 'Resolved' },
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<div>Hello World</div>',
				HtmlTemplate: Shell,
			});

			const text = await new Response(body as BodyInit).text();
			expect(text).toContain('<h1>Resolved</h1>');
		});

		it('passes route-resolved dependency roots into the document shell', async () => {
			const testRenderer = createRenderer();
			const resolvedContent = (() => '<article>Resolved content</article>') as unknown as EcoComponent;
			const resolvedDependencyMetadata: Partial<EcoComponent> = {
				config: {
					identity: {
						id: 'resolved-dependency-metadata',
						file: '/project/src/content/entry.mdx',
						integration: 'lit',
					},
					dependencies: {
						scripts: [{ src: './entry.ts', lazy: { 'on:idle': true }, ssr: true }],
					},
				},
			};
			const renderPageShell = vi
				.spyOn(
					testRenderer as unknown as {
						renderPageWithDocumentShell(input: unknown): Promise<string>;
					},
					'renderPageWithDocumentShell',
				)
				.mockResolvedValue('<html><body></body></html>');

			await testRenderer.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				resolvedPageDependencyComponents: [resolvedContent, resolvedDependencyMetadata],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => '<div>Hello World</div>',
				HtmlTemplate,
			});

			expect(renderPageShell).toHaveBeenCalledWith(
				expect.objectContaining({
					foreignChildRoots: [resolvedContent, resolvedDependencyMetadata],
				}),
			);
			expect(testRenderer.preloadedComponentBatches[0]).toContain(resolvedContent);
			expect(testRenderer.preloadedComponentBatches[0]).toContain(resolvedDependencyMetadata);
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
						identity: {
							integration: 'string',
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
						identity: {
							integration: 'string',
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
						identity: {
							integration: 'string',
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
	});

	describe('renderExplicitView', () => {
		it('should not route full view rendering through capture-plus-finalize', async () => {
			const testRenderer = createRenderer();
			const View = (async () => '<p>Explicit</p>') as unknown as EcoComponent<object>;

			const response = await testRenderer.renderExplicitView(View, {}, {});
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

			const response = await testRenderer.renderExplicitView(View, {}, {});
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
			View.config = { layouts: [Layout] };

			const response = await testRenderer.renderExplicitView(View, {}, {});
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

			const response = await testRenderer.renderExplicitView(View, {}, {});
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
						identity: {
							integration: 'string',
						},
					},
				},
			) as EcoComponent<HtmlTemplateProps>;

			testRenderer.htmlTemplate = NonLitHtmlTemplate;

			const response = await testRenderer.renderExplicitView(View, {}, {});
			const body = await response.text();

			expect(body).toContain('<p>Fallback</p>');
			expect(body).not.toContain('<--content-->');
		});
	});

	describe('lazy worker session', () => {
		it('uses the worker after plugin setup assigns a session to a pre-created renderer', async () => {
			const sessionHolder: { current?: Pick<LitStaticRenderSession, 'renderPageInWorker'> } = {};
			const renderPageInWorker = vi.fn(async () => ({
				html: '<html>lazy-worker</html>',
				cacheStrategy: { revalidate: 15 },
				sourceDependencyPaths: ['/app/pages/index.lit.tsx'],
			}));

			const renderer = new LitRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				getRenderSession: () => sessionHolder.current as LitStaticRenderSession | undefined,
			});

			const inProcessSpy = vi.spyOn(IntegrationRenderer.prototype, 'execute').mockResolvedValue({
				body: '<html>in-process</html>',
			});

			try {
				await renderer.execute({ file: '/app/pages/index.lit.tsx', params: {} });
				expect(renderPageInWorker).not.toHaveBeenCalled();
				expect(inProcessSpy).toHaveBeenCalledTimes(1);

				sessionHolder.current = { renderPageInWorker };
				inProcessSpy.mockClear();

				const result = await renderer.execute({
					file: '/app/pages/index.lit.tsx',
					params: { slug: ['a', 'b'] },
					query: { tag: ['x', 'y'] },
				});

				expect(inProcessSpy).not.toHaveBeenCalled();
				expect(renderPageInWorker).toHaveBeenCalledWith({
					filePath: '/app/pages/index.lit.tsx',
					params: { slug: ['a', 'b'] },
					query: { tag: ['x', 'y'] },
				});
				expect(result).toEqual({
					body: '<html>lazy-worker</html>',
					cacheStrategy: { revalidate: 15 },
					sourceDependencyPaths: ['/app/pages/index.lit.tsx'],
				});
			} finally {
				inProcessSpy.mockRestore();
			}
		});

		it('forces in-process execute when locals are present', async () => {
			const renderPageInWorker = vi.fn(async () => ({
				html: '<html>worker</html>',
			}));

			const renderer = new LitRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				getRenderSession: () =>
					({
						renderPageInWorker,
					}) as Pick<LitStaticRenderSession, 'renderPageInWorker'> as LitStaticRenderSession,
			});

			const inProcessSpy = vi.spyOn(IntegrationRenderer.prototype, 'execute').mockResolvedValue({
				body: '<html>locals-in-process</html>',
			});

			try {
				const result = await renderer.execute({
					file: '/app/pages/index.lit.tsx',
					params: { id: '1' },
					locals: { requestId: 'req-1' },
				});

				expect(renderPageInWorker).not.toHaveBeenCalled();
				expect(inProcessSpy).toHaveBeenCalledWith({
					file: '/app/pages/index.lit.tsx',
					params: { id: '1' },
					locals: { requestId: 'req-1' },
				});
				expect(result).toEqual({ body: '<html>locals-in-process</html>' });
			} finally {
				inProcessSpy.mockRestore();
			}
		});

		it('forces in-process execute when explicit view props are present', async () => {
			const renderPageInWorker = vi.fn(async () => ({
				html: '<html>worker</html>',
			}));
			const renderer = new LitRenderer({
				appConfig: Config,
				assetProcessingService: {} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				getRenderSession: () =>
					({
						renderPageInWorker,
					}) as Pick<LitStaticRenderSession, 'renderPageInWorker'> as LitStaticRenderSession,
			});
			const inProcessSpy = vi.spyOn(IntegrationRenderer.prototype, 'execute').mockResolvedValue({
				body: '<html>props-in-process</html>',
			});

			try {
				const result = await renderer.execute({
					file: 'explicit:lit:view',
					params: {},
					props: { label: 'Ready' },
					pageModule: { default: (() => '<p>Ready</p>') as EcoComponent },
				});

				expect(renderPageInWorker).not.toHaveBeenCalled();
				expect(result).toEqual({ body: '<html>props-in-process</html>' });
				expect(inProcessSpy).toHaveBeenCalled();
			} finally {
				inProcessSpy.mockRestore();
			}
		});
	});

	describe('ensureLitDomShim', () => {
		it('repairs Element and HTMLElement when foreign shim lacks attributes and attachShadow', async () => {
			const { ensureLitDomShim } = await import('../dom-shim.ts');
			const originalAttributes = Object.getOwnPropertyDescriptor(globalThis.Element.prototype, 'attributes');
			const originalAttachShadow = Object.getOwnPropertyDescriptor(globalThis.Element.prototype, 'attachShadow');

			try {
				delete (globalThis.Element.prototype as unknown as Record<string, unknown>).attributes;
				delete (globalThis.Element.prototype as unknown as Record<string, unknown>).attachShadow;

				ensureLitDomShim();

				expect('attributes' in globalThis.Element.prototype).toBe(true);
				expect(typeof globalThis.Element.prototype.attachShadow).toBe('function');

				class MockEl extends globalThis.Element {
					override getAttributeNames() {
						return ['data-test'];
					}
					override getAttribute(name: string) {
						return name === 'data-test' ? 'value' : null;
					}
				}
				const el = new MockEl();
				expect((el as unknown as { attributes: Array<{ name: string; value: string }> }).attributes).toEqual([
					{ name: 'data-test', value: 'value' },
				]);
			} finally {
				if (originalAttributes) {
					Object.defineProperty(globalThis.Element.prototype, 'attributes', originalAttributes);
				}
				if (originalAttachShadow) {
					Object.defineProperty(globalThis.Element.prototype, 'attachShadow', originalAttachShadow);
				}
			}
		});
	});
});
