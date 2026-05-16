/** @jsxImportSource @ecopages/jsx */
import { fileURLToPath } from 'node:url';
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
import { createMarkupNodeLike, type JsxCustomElementAttributes, type JsxRenderable } from '@ecopages/jsx';
import { getActiveSsrScopeValue, renderToString, withActiveSsrScopeValue } from '@ecopages/jsx/server';
import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
import { createDeferredIntegrationPlugin, createTestAppConfig } from '@ecopages/testing';
import { EcopagesJsxShell as KitchenSinkEcopagesJsxShell } from '@ecopages/testing/kitchen-sink/ecopages-jsx-shell';
import { KitaShell as KitchenSinkKitaShell } from '@ecopages/testing/kitchen-sink/kita-shell';
import { LitShell as KitchenSinkLitShell } from '@ecopages/testing/kitchen-sink/lit-shell';
import { ReactShell as KitchenSinkReactShell } from '@ecopages/testing/kitchen-sink/react-shell';
import type { ForeignChildInterceptionInput } from '../../../../core/src/route-renderer/orchestration/component-render-context';
import { kitajsPlugin } from '../../../kitajs/src/kitajs.plugin';
import { litPlugin } from '../../../lit/src/lit.plugin';
import { reactPlugin } from '../../../react/src/react.plugin';
import { ecopagesJsxPlugin } from '../ecopages-jsx.plugin';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer';
import { IntegrationCounterGroup as KitchenSinkIntegrationCounterGroup } from '../../../../../playground/kitchen-sink/src/components/integration-counter-group.kita';

const KITCHEN_SINK_ROOT = fileURLToPath(new URL('../../../../../playground/kitchen-sink', import.meta.url));

type StringChildProps = {
	children?: JsxRenderable;
};

type IntrinsicContractElement = HTMLElement & { count?: number };
type RadiantArrayContractElement = HTMLElement & { items: Array<{ id: string }> };

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'ecopages-jsx-intrinsic-contract': JsxCustomElementAttributes<IntrinsicContractElement, { count?: number }>;
		'ecopages-jsx-radiant-array-contract': JsxCustomElementAttributes<RadiantArrayContractElement>;
	}
}

const Config = await createTestAppConfig();

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

function serializeStringChild(children: JsxRenderable | undefined): string {
	if (children === undefined) {
		return '';
	}

	return typeof children === 'string' ? children : renderToString(children);
}

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
	}

	protected override async resolveDependencies(): Promise<[]> {
		return [];
	}

	public createTestForeignChildRuntime(input: ComponentRenderInput) {
		return this.createForeignChildRuntime({
			renderInput: input,
			rendererCache: new Map<string, IntegrationRenderer<any>>(),
		});
	}
}

class StringChildContractRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'string-child-contract';
	async render(): Promise<string> {
		return '';
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		return await this.renderStringComponentWithQueuedForeignSubtrees(input, async (props) => {
			if (props.children !== undefined && typeof props.children !== 'string') {
				throw new TypeError(
					this.name === 'kitajs'
						? 'Objects are not valid as a KitaJSX child'
						: `Expected serialized children in ${this.name} renderer.`,
				);
			}

			const component = input.component as (props: Record<string, unknown>) => string | Promise<string>;
			return await component(props);
		});
	}

	async renderToResponse<P = Record<string, unknown>>(
		_view: EcoComponent<P>,
		_props: P,
		_ctx: RenderToResponseContext,
	) {
		return new Response('');
	}
}

class StringChildContractPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer: typeof StringChildContractRenderer;

	constructor(name: string, extension: string) {
		class NamedStringChildContractRenderer extends StringChildContractRenderer {
			override name = name;
		}

		super({
			name,
			extensions: [extension],
		});

		this.renderer = NamedStringChildContractRenderer;
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

			expect(result).toMatchObject<Partial<ForeignSubtreeRenderPayload>>({
				assets: [],
				rootTag: 'section',
				rootAttributes: undefined,
				attachmentPolicy: { kind: 'first-element' },
				integrationName: 'ecopages-jsx',
			});
			expect(result.html).toContain('data-jsx-foreign-subtree="true"');
			expect(result.html).toContain('>ready</section>');
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

			const deferredPlugin = createDeferredIntegrationPlugin({
				renderComponent: deferredRenderComponent,
			});
			const config = await createTestAppConfig({
				integrations: [deferredPlugin],
			});

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

		it('serializes nested foreign children before delegating a string-first foreign shell', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const litPlugin = new StringChildContractPlugin('lit', '.lit.tsx');
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([kitajsPlugin, litPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			kitajsPlugin.setConfig(config);
			kitajsPlugin.setRuntimeOrigin('http://localhost:3000');
			litPlugin.setConfig(config);
			litPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const LitLeaf = eco.component<{}, string>({
				integration: 'lit',
				render: () => '<span data-foreign-leaf="true">Leaf</span>',
			});

			const KitaShell = eco.component<StringChildProps, string>({
				integration: 'kitajs',
				dependencies: {
					components: [LitLeaf],
				},
				render: ({ children }) =>
					`<section data-kitajs-shell="true">${serializeStringChild(children)}</section>`,
			});

			const Page = eco.component({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [KitaShell, LitLeaf],
				},
				render: () => (
					<KitaShell>
						<LitLeaf />
					</KitaShell>
				),
			});

			const result = await renderer.renderComponentWithForeignChildren({
				component: Page,
				props: {},
				integrationContext: {
					componentInstanceId: 'host',
				},
			});

			expect(result.html).toContain(
				'<section data-kitajs-shell="true"><span data-foreign-leaf="true">Leaf</span></section>',
			);
			expect(result.html).not.toContain('[object Object]');
		});

		it('resolves nested foreign descendants inside a direct foreign component rendered by an Ecopages JSX page', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const litPlugin = new StringChildContractPlugin('lit', '.lit.tsx');
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([kitajsPlugin, litPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			kitajsPlugin.setConfig(config);
			kitajsPlugin.setRuntimeOrigin('http://localhost:3000');
			litPlugin.setConfig(config);
			litPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const LitLeaf = eco.component<{}, string>({
				integration: 'lit',
				render: () => '<span data-foreign-leaf="true">Leaf</span>',
			});

			const KitaGroup = eco.component<{}, string>({
				integration: 'kitajs',
				dependencies: {
					components: [LitLeaf],
				},
				render: () => `<section data-kitajs-group="true">${serializeStringChild(LitLeaf({}))}</section>`,
			});

			const Page = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [KitaGroup, LitLeaf],
				},
				render: () => (
					<main>
						<KitaGroup />
					</main>
				),
			});

			const result = await renderer.renderComponentWithForeignChildren({
				component: Page,
				props: {},
				integrationContext: {
					componentInstanceId: 'direct-foreign-group-host',
				},
			});

			expect(result.html).toContain(
				'<main><section data-kitajs-group="true"><span data-foreign-leaf="true">Leaf</span></section></main>',
			);
			expect(result.html).not.toContain('[object Object]');
		});

		it('renders the real kitchen-sink mixed shell stack without leaking foreign renderer objects', async () => {
			const jsx = ecopagesJsxPlugin();
			const kitajs = kitajsPlugin();
			const lit = litPlugin();
			const react = reactPlugin({
				extensions: ['.react.tsx'],
			});
			const config = await new ConfigBuilder()
				.setRootDir(KITCHEN_SINK_ROOT)
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([jsx, kitajs, lit, react])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			jsx.setConfig(config);
			jsx.setRuntimeOrigin('http://localhost:3000');
			kitajs.setConfig(config);
			kitajs.setRuntimeOrigin('http://localhost:3000');
			lit.setConfig(config);
			lit.setRuntimeOrigin('http://localhost:3000');
			react.setConfig(config);
			react.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const RealKitaShell = KitchenSinkKitaShell as unknown as (props: {
				id: string;
				children?: JsxRenderable;
			}) => JsxRenderable;
			const RealLitShell = KitchenSinkLitShell as unknown as (props: {
				id: string;
				children?: JsxRenderable;
			}) => JsxRenderable;
			const RealReactShell = KitchenSinkReactShell as unknown as (props: {
				id: string;
				children?: JsxRenderable;
			}) => JsxRenderable;
			const RealCounterGroup = KitchenSinkIntegrationCounterGroup as unknown as (props: {
				testId: string;
				radiantId: string;
			}) => JsxRenderable;

			const Page = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [
						KitchenSinkIntegrationCounterGroup,
						KitchenSinkKitaShell,
						KitchenSinkLitShell,
						KitchenSinkReactShell,
						KitchenSinkEcopagesJsxShell,
					],
				},
				render: () => (
					<div>
						<KitchenSinkEcopagesJsxShell id="host-shell">
							<RealKitaShell id="kita-shell">
								<RealLitShell id="lit-shell">
									<RealReactShell id="react-shell">Leaf</RealReactShell>
								</RealLitShell>
							</RealKitaShell>
						</KitchenSinkEcopagesJsxShell>
						<RealCounterGroup testId="kitchen-sink-counters" radiantId="kitchen-sink-radiant" />
					</div>
				),
			});

			const result = await renderer.renderComponentWithForeignChildren({
				component: Page,
				props: {},
				integrationContext: {
					componentInstanceId: 'kitchen-sink-host',
				},
			});

			expect(result.html).toContain('integration-shell__body');
			expect(result.html).toContain('kitchen-sink-counters');
			expect(result.html).not.toContain('[object Object]');
		});

		it('preserves normalized props when the delegated child stays inline', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([kitajsPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			kitajsPlugin.setConfig(config);
			kitajsPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const KitaShell = eco.component<StringChildProps, string>({
				integration: 'kitajs',
				render: ({ children }) =>
					`<section data-kitajs-shell="true">${serializeStringChild(children)}</section>`,
			});

			const runtime = renderer.createTestForeignChildRuntime({
				component: KitaShell,
				props: {},
				integrationContext: {
					rendererCache: new Map<string, IntegrationRenderer<any>>(),
				},
			});

			const result = await runtime.interceptForeignChild?.({
				currentIntegration: 'kitajs',
				targetIntegration: 'kitajs',
				component: KitaShell,
				props: {
					children: createMarkupNodeLike('<span data-inline-child="true">Leaf</span>'),
				},
			} satisfies ForeignChildInterceptionInput);

			expect(result).toEqual({
				kind: 'inline',
				props: {
					children: '<span data-inline-child="true">Leaf</span>',
				},
			});
		});

		it('serializes queued foreign child props before storing them in the Ecopages JSX runtime context', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const litPlugin = new StringChildContractPlugin('lit', '.lit.tsx');
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([kitajsPlugin, litPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			kitajsPlugin.setConfig(config);
			kitajsPlugin.setRuntimeOrigin('http://localhost:3000');
			litPlugin.setConfig(config);
			litPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const LitLeaf = eco.component<{}, string>({
				integration: 'lit',
				render: () => '<span data-foreign-leaf="true">Leaf</span>',
			});

			const KitaShell = eco.component<StringChildProps, string>({
				integration: 'kitajs',
				dependencies: {
					components: [LitLeaf],
				},
				render: ({ children }) =>
					`<section data-kitajs-shell="true">${serializeStringChild(children)}</section>`,
			});

			const renderInput: ComponentRenderInput = {
				component: KitaShell,
				props: {},
				integrationContext: {
					rendererCache: new Map<string, IntegrationRenderer<any>>(),
				},
			};

			const runtime = renderer.createTestForeignChildRuntime(renderInput);
			const result = runtime.interceptForeignChildSync?.({
				currentIntegration: 'ecopages-jsx',
				targetIntegration: 'kitajs',
				component: KitaShell,
				props: {
					children: <LitLeaf />,
				},
			} satisfies ForeignChildInterceptionInput);

			expect(result).toEqual({
				kind: 'resolved',
				value: '__ecopages-jsx_foreign_subtree__root__1__',
			});

			const runtimeContext = (
				renderInput.integrationContext as Record<
					string,
					{ queuedResolutions: Array<{ props: Record<string, unknown> }> }
				>
			)['__ecopages-jsx_foreign_subtree_runtime__'];

			expect(runtimeContext?.queuedResolutions[0]?.props.children).toBe(
				'<span data-foreign-leaf="true">Leaf</span>',
			);
		});

		it('supports generated Ecopages JSX shells that serialize non-string children with renderToString', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const litPlugin = new StringChildContractPlugin('lit', '.lit.tsx');
			const reactPlugin = new StringChildContractPlugin('react', '.react.tsx');
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([kitajsPlugin, litPlugin, reactPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			kitajsPlugin.setConfig(config);
			kitajsPlugin.setRuntimeOrigin('http://localhost:3000');
			litPlugin.setConfig(config);
			litPlugin.setRuntimeOrigin('http://localhost:3000');
			reactPlugin.setConfig(config);
			reactPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const ReactLeaf = eco.component<StringChildProps, string>({
				integration: 'react',
				render: ({ children }) => `<span data-react-leaf="true">${serializeStringChild(children)}</span>`,
			});

			const LitShell = eco.component<StringChildProps, string>({
				integration: 'lit',
				dependencies: {
					components: [ReactLeaf],
				},
				render: ({ children }) => `<div data-lit-shell="true">${serializeStringChild(children)}</div>`,
			});

			const KitaShell = eco.component<StringChildProps, string>({
				integration: 'kitajs',
				dependencies: {
					components: [LitShell, ReactLeaf],
				},
				render: ({ children }) =>
					`<section data-kitajs-shell="true">${serializeStringChild(children)}</section>`,
			});

			const GeneratedShell = eco.component<{ children?: JsxRenderable | string }, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [KitaShell, LitShell, ReactLeaf],
				},
				render: ({ children }) => {
					const renderedChildren =
						children === undefined
							? undefined
							: createMarkupNodeLike(typeof children === 'string' ? children : renderToString(children));

					return <div data-generated-shell>{renderedChildren}</div>;
				},
			});

			const Page = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					components: [GeneratedShell, KitaShell, LitShell, ReactLeaf],
				},
				render: () => (
					<GeneratedShell>
						<KitaShell>
							<LitShell>
								<ReactLeaf>Leaf</ReactLeaf>
							</LitShell>
						</KitaShell>
					</GeneratedShell>
				),
			});

			const result = await renderer.renderComponentWithForeignChildren({
				component: Page,
				props: {},
				integrationContext: {
					componentInstanceId: 'generated-shell-host',
				},
			});

			expect(result.html).toContain('data-generated-shell="true"');
			expect(result.html).toContain('<section data-kitajs-shell="true">');
			expect(result.html).toContain('<div data-lit-shell="true">');
			expect(result.html).toContain('<span data-react-leaf="true">Leaf</span>');
		});

		it('supports generated Ecopages JSX shells when a delegated Kita subtree re-enters Ecopages JSX', async () => {
			const jsxPlugin = ecopagesJsxPlugin();
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const config = await new ConfigBuilder()
				.setRobotsTxt({
					preferences: {
						'*': [],
					},
				})
				.setIntegrations([jsxPlugin, kitajsPlugin])
				.setDefaultMetadata({
					title: 'Ecopages',
					description: 'Ecopages',
				})
				.setBaseUrl('http://localhost:3000')
				.build();

			jsxPlugin.setConfig(config);
			jsxPlugin.setRuntimeOrigin('http://localhost:3000');
			kitajsPlugin.setConfig(config);
			kitajsPlugin.setRuntimeOrigin('http://localhost:3000');

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const EcopagesJsxLeaf = eco.component<{}, JsxRenderable>({
				__eco: {
					id: 'generated-bounce-leaf',
					file: '/app/components/generated-bounce-leaf.eco.tsx',
					integration: 'ecopages-jsx',
				},
				integration: 'ecopages-jsx',
				render: () => <strong data-ecopages-jsx-leaf>Leaf</strong>,
			});

			const KitaGroup = eco.component<{}, string>({
				__eco: {
					id: 'generated-bounce-kita-group',
					file: '/app/components/generated-bounce-group.kita.tsx',
					integration: 'kitajs',
				},
				integration: 'kitajs',
				dependencies: {
					components: [EcopagesJsxLeaf],
				},
				render: () => `<section data-kitajs-group="true">${renderToString(EcopagesJsxLeaf({}))}</section>`,
			});

			const KitaShell = eco.component<StringChildProps, string>({
				__eco: {
					id: 'generated-bounce-kita-shell',
					file: '/app/components/generated-bounce-shell.kita.tsx',
					integration: 'kitajs',
				},
				integration: 'kitajs',
				dependencies: {
					components: [KitaGroup],
				},
				render: ({ children }) => `<div data-kitajs-shell="true">${serializeStringChild(children)}</div>`,
			});

			const GeneratedShell = eco.component<{ children?: JsxRenderable | string }, JsxRenderable>({
				__eco: {
					id: 'generated-bounce-shell',
					file: '/app/components/generated-bounce-shell.eco.tsx',
					integration: 'ecopages-jsx',
				},
				integration: 'ecopages-jsx',
				dependencies: {
					components: [KitaShell, KitaGroup, EcopagesJsxLeaf],
				},
				render: ({ children }) => {
					const renderedChildren =
						children === undefined
							? undefined
							: createMarkupNodeLike(typeof children === 'string' ? children : renderToString(children));

					return <div data-generated-bounce-shell>{renderedChildren}</div>;
				},
			});

			const Page = eco.component<{}, JsxRenderable>({
				__eco: {
					id: 'generated-bounce-page',
					file: '/app/pages/generated-bounce-page.eco.tsx',
					integration: 'ecopages-jsx',
				},
				integration: 'ecopages-jsx',
				dependencies: {
					components: [GeneratedShell, KitaShell, KitaGroup, EcopagesJsxLeaf],
				},
				render: () => (
					<GeneratedShell>
						<KitaShell>
							<KitaGroup />
						</KitaShell>
					</GeneratedShell>
				),
			});

			const result = await renderer.renderComponentWithForeignChildren({
				component: Page,
				props: {},
				integrationContext: {
					componentInstanceId: 'generated-bounce-host',
				},
			});

			expect(result.html).toContain('data-generated-bounce-shell="true"');
			expect(result.html).toContain('<div data-kitajs-shell="true">');
			expect(result.html).toContain('<section data-kitajs-group="true">');
			expect(result.html).toContain('<strong');
			expect(result.html).toContain('data-ecopages-jsx-leaf="true"');
			expect(result.html).toContain('>Leaf</strong>');
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

		it('uses the custom-element SSR hook path for registered intrinsic elements and preserves specialized rendering through wrappers during plain component renders', async () => {
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
					createIntrinsicCustomElementRenderHook(): ({ tagName }: { tagName: string }) => undefined;
				}
			).createIntrinsicCustomElementRenderHook();

			expect(() => hook({ tagName: INTRINSIC_TEST_TAG })).not.toThrow();
			expect(collectedAssets).toEqual([]);
		});
	});

	describe('renderToResponse', () => {
		it('renders full route pages through renderer-owned explicit foreign-subtree renders', async () => {
			const deferredPlugin = createDeferredIntegrationPlugin();
			const config = await createTestAppConfig({
				integrations: [deferredPlugin],
			});

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
			expect(body).toContain('data-document-root="true"');
			expect(body).toContain('data-layout-root="true"');
			expect(body).toContain('data-view-root="true">Ready</section>');
			expect(body).not.toContain('&lt;section');
		});
	});
});
