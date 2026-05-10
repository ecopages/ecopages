/** @jsxImportSource @ecopages/jsx */
import { describe, expect, it, vi } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import {
	eco,
	type ForeignSubtreeRenderPayload,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type EcoPagesElement,
	type HtmlTemplateProps,
} from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { getActiveSsrScopeValue, renderToString, withActiveSsrScopeValue } from '@ecopages/jsx/server';
import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
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

const ECOPAGES_JSX_SSR_RENDER_STATE_KEY = Symbol.for('@ecopages/ecopages-jsx.ssr-render-state');
const INTRINSIC_TEST_TAG = 'ecopages-jsx-intrinsic-contract';
const RADIANT_ARRAY_TEST_TAG = 'ecopages-jsx-radiant-array-contract';

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
		it('returns component-scoped dependency assets for foreign-subtree renders', async () => {
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

		it('exposes the compatibility foreign-subtree payload contract', async () => {
			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const Component = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: () => <section data-jsx-foreign-subtree>ready</section>,
			});

			const result = await renderer.renderForeignSubtree({
				component: Component,
				props: {},
			});

			expect(result).toEqual<ForeignSubtreeRenderPayload>({
				html: '<section data-jsx-foreign-subtree="true">ready</section>',
				assets: [],
				rootTag: 'section',
				rootAttributes: undefined,
				attachmentPolicy: { kind: 'first-element' },
				integrationName: 'ecopages-jsx',
			});
		});

		it('resolves foreign boundaries inside the JSX renderer and bubbles nested assets', async () => {
			const deferredRenderComponent = vi.fn(
				async (input: ComponentRenderInput): Promise<ComponentRenderResult> => ({
					html: '<button data-testid="deferred-widget">Deferred widget</button>',
					canAttachAttributes: true,
					rootTag: 'button',
					integrationName: 'deferred',
					rootAttributes: {
						'data-eco-component-id':
							(input.integrationContext as { componentInstanceId?: string } | undefined)
								?.componentInstanceId ?? 'missing',
					},
					assets: [
						{
							kind: 'script' as const,
							inline: true,
							content: 'console.log("deferred-jsx")',
							position: 'body' as const,
						},
					],
				}),
			);

			class DeferredForeignSubtreeRenderer extends IntegrationRenderer<EcoPagesElement> {
				name = 'deferred';

				async render(): Promise<string> {
					return '';
				}

				override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
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

			class DeferredForeignSubtreePlugin extends IntegrationPlugin<EcoPagesElement> {
				renderer = DeferredForeignSubtreeRenderer;

				constructor() {
					super({
						name: 'deferred',
						extensions: ['.deferred.tsx'],
					});
				}
			}

			const deferredPlugin = new DeferredForeignSubtreePlugin();
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
				__eco: {
					id: 'deferred-widget',
					file: '/app/components/deferred-widget.deferred.tsx',
					integration: 'deferred',
				},
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});

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

			const result = await renderer.renderComponentWithForeignChildren({
				component: Shell,
				props: {},
				integrationContext: {
					componentInstanceId: 'host',
				},
			});

			expect(result.html).toContain('<section>Host child</section>');
			expect(result.html).toContain(
				'<button data-eco-component-id="host_n_1" data-testid="deferred-widget">Deferred widget</button>',
			);
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

		it('propagates renderer SSR scope across nested JSX renders', async () => {
			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const NestedScopeProbe = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: () => {
					const state = getActiveSsrScopeValue<{ collectedAssetFrames: unknown[] }>(
						ECOPAGES_JSX_SSR_RENDER_STATE_KEY,
					);

					return (
						<span
							data-nested-scope={String(Boolean(state))}
							data-nested-frame-depth={state?.collectedAssetFrames.length ?? -1}
						/>
					);
				},
			});

			const OuterScopeProbe = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: () => {
					const state = getActiveSsrScopeValue<{ collectedAssetFrames: unknown[] }>(
						ECOPAGES_JSX_SSR_RENDER_STATE_KEY,
					);
					const nestedHtml = renderToString(<NestedScopeProbe />);

					return (
						<section
							data-outer-scope={String(Boolean(state))}
							data-outer-frame-depth={state?.collectedAssetFrames.length ?? -1}
						>
							{createMarkupNodeLike(nestedHtml)}
						</section>
					);
				},
			});

			const result = await renderer.renderComponent({
				component: OuterScopeProbe,
				props: {},
			});

			expect(result.html).toContain('data-outer-scope="true"');
			expect(result.html).toContain('data-outer-frame-depth="1"');
			expect(result.html).toContain('data-nested-scope="true"');
			expect(result.html).toContain('data-nested-frame-depth="1"');
		});

		it('preserves SSR scope across nested async scope helpers', async () => {
			const outerScopeKey = Symbol('outer-async-scope');
			const innerScopeKey = Symbol('inner-async-scope');

			const result = await withActiveSsrScopeValue(outerScopeKey, 'outer', async () => {
				await Promise.resolve();

				const nestedResult = await withActiveSsrScopeValue(innerScopeKey, 'inner', async () => {
					await Promise.resolve();

					return {
						outer: getActiveSsrScopeValue<string>(outerScopeKey),
						inner: getActiveSsrScopeValue<string>(innerScopeKey),
					};
				});

				return {
					outer: getActiveSsrScopeValue<string>(outerScopeKey),
					inner: getActiveSsrScopeValue<string>(innerScopeKey),
					nestedResult,
				};
			});

			expect(result).toEqual({
				outer: 'outer',
				inner: undefined,
				nestedResult: {
					outer: 'outer',
					inner: 'inner',
				},
			});
		});

		it('uses the custom-element SSR hook path for registered intrinsic elements and preserves specialized rendering through wrappers', async () => {
			installLightDomShim();

			if (!customElements.get(INTRINSIC_TEST_TAG)) {
				class IntrinsicContractElement extends HTMLElement {
					declare count?: number;

					renderHostToString(options: { hydrate?: boolean; mode?: 'hydrate' | 'plain' }) {
						const mode = options.mode ?? (options.hydrate ? 'hydrate' : 'plain');
						return `<${INTRINSIC_TEST_TAG} data-count="${String(this.count ?? '')}" data-ssr-mode="${mode}"><span data-testid="intrinsic-contract">${String(this.count ?? '')}</span></${INTRINSIC_TEST_TAG}>`;
					}
				}

				customElements.define(INTRINSIC_TEST_TAG, IntrinsicContractElement);
			}

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				jsxConfig: {
					radiantSsrEnabled: true,
				},
			});

			const WrappedIntrinsic = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: () => <ecopages-jsx-intrinsic-contract count={2} />,
			});

			const Page = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: () => (
					<section>
						<WrappedIntrinsic />
					</section>
				),
			});

			const result = await renderer.renderComponent({
				component: Page,
				props: {},
			});

			expect(result.html).toContain('data-ssr-mode="plain"');
			expect(result.html).toContain('data-count="2"');
			expect(result.html).toContain('data-testid="intrinsic-contract"');
			expect(result.assets).toEqual([]);
		});

		it('server-renders Radiant custom elements with array props without requiring wrapper attribute serialization', async () => {
			installLightDomShim();
			const [{ RadiantElement }, { customElement }, { prop }] = await Promise.all([
				import('@ecopages/radiant/core/radiant-element'),
				import('@ecopages/radiant/decorators/custom-element'),
				import('@ecopages/radiant/decorators/prop'),
			]);

			if (!customElements.get(RADIANT_ARRAY_TEST_TAG)) {
				@customElement(RADIANT_ARRAY_TEST_TAG)
				class RadiantArrayContractElement extends RadiantElement {
					@prop({ type: Array }) items: Array<{ id: string }> = [];

					override render() {
						return (
							<div data-testid="radiant-array-contract" data-items-count={String(this.items.length)} />
						);
					}
				}
				void RadiantArrayContractElement;
			}

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				jsxConfig: {
					radiantSsrEnabled: true,
				},
			});

			const Page = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				render: () => (
					<section>
						<ecopages-jsx-radiant-array-contract prop:items={[{ id: 'bun' }]} />
					</section>
				),
			});

			const result = await renderer.renderComponent({
				component: Page,
				props: {},
			});

			expect(result.html).toContain('data-testid="radiant-array-contract"');
			expect(result.html).toContain('data-items-count="1"');
			expect(result.html).toContain('items="[{&quot;id&quot;:&quot;bun&quot;}]"');
		});

		it('does not require an active renderer SSR scope when the intrinsic custom-element hook is consulted late', () => {
			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				jsxConfig: {},
			});

			const collectedAssets: Array<{ kind: string; srcUrl: string; position: string }> = [];
			const hook = (
				renderer as unknown as {
					createIntrinsicCustomElementRenderHook(
						target: typeof collectedAssets,
					): ({ tagName }: { tagName: string }) => undefined;
				}
			).createIntrinsicCustomElementRenderHook(collectedAssets);

			expect(() => hook({ tagName: INTRINSIC_TEST_TAG })).not.toThrow();
			expect(collectedAssets).toEqual([]);
		});
	});

	describe('renderToResponse', () => {
		it('renders full route pages through renderer-owned explicit foreign-subtree renders', async () => {
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
				__eco: {
					id: 'deferred-widget',
					file: '/app/components/deferred-widget.deferred.tsx',
					integration: 'deferred',
				},
				integration: 'deferred',
				render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
			});

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

		it('renders full JSX views through renderer-owned explicit foreign-subtree renders', async () => {
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
