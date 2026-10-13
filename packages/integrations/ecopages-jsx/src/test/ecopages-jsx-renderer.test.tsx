/** @jsxImportSource @ecopages/jsx */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';
import {
	eco,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type EcoPagesElement,
	type HtmlTemplateProps,
} from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { createMarkupNodeLike, type JsxCustomElementAttributes, type JsxRenderable } from '@ecopages/jsx';
import { getActiveSsrScopeValue, renderToString, withActiveSsrScopeValue } from '@ecopages/jsx/server';
import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
import { createTestAppConfig } from '@ecopages/testing';
import { describeRendererContract } from '@ecopages/testing/renderer-contract';
import type { ForeignChildInterceptionInput } from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';
import { ecopagesJsxPlugin } from '../ecopages-jsx.plugin';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer';

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

const outputRoot = mkdtempSync(path.join(tmpdir(), 'ecopages-jsx-renderer-test-'));
const outputDirs = { distDir: path.join(outputRoot, 'dist'), workDir: path.join(outputRoot, '.eco') };

afterAll(() => {
	rmSync(outputRoot, { recursive: true, force: true });
});

const Config = await createTestAppConfig(outputDirs);

const HtmlTemplate = ({ children }: { children: JsxRenderable }) => {
	return (
		<html>
			<body>
				<main data-document-root>{children}</main>
			</body>
		</html>
	);
};
(HtmlTemplate as unknown as EcoComponent).config = {
	integration: 'ecopages-jsx',
	identity: { id: 'html', file: '/app/includes/html.tsx', integration: 'ecopages-jsx' },
};
const INTRINSIC_TEST_TAG = 'ecopages-jsx-intrinsic-contract';
const RADIANT_ARRAY_TEST_TAG = 'ecopages-jsx-radiant-array-contract';
function serializeStringChild(children: JsxRenderable | undefined): string {
	if (children === undefined) {
		return '';
	}

	return typeof children === 'string' ? children : renderToString(children);
}

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
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

const headedTemplate = ({ children, metadata }: HtmlTemplateProps<JsxRenderable>) => (
	<html>
		<head>
			<title>{metadata.title}</title>
		</head>
		<body>
			<main data-document-root>{children}</main>
		</body>
	</html>
);
(headedTemplate as unknown as EcoComponent).config = {
	integration: 'ecopages-jsx',
	identity: { id: 'html', file: '/app/includes/html.tsx', integration: 'ecopages-jsx' },
};

describeRendererContract({
	name: 'ecopages-jsx',
	errorPrefix: 'Error rendering component',
	async createRenderer({ integrations, processDependencies }) {
		const testRenderer = new TestEcopagesJsxRenderer({
			appConfig: await createTestAppConfig({ ...outputDirs, integrations }),
			assetProcessingService: { processDependencies } as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = headedTemplate as unknown as EcoComponent<HtmlTemplateProps>;
		return testRenderer;
	},
	makeComponent({ tag, acceptsChildren, asLayout, config, embed }) {
		const Tag = tag as 'section';
		const identity =
			config?.identity ??
			(asLayout
				? { id: 'contract-layout', file: '/app/layouts/contract.tsx', integration: 'ecopages-jsx' }
				: undefined);
		const dependencies = { ...config?.dependencies, ...(embed ? { components: embed } : {}) };
		const renderMarkup = (props: Record<string, unknown>) => (
			<Tag>
				{props.text as string | undefined}
				{acceptsChildren ? (props.children as JsxRenderable) : undefined}
				{(embed ?? []).map((Widget) => {
					const Embedded = Widget as unknown as () => JsxRenderable;
					return <Embedded />;
				})}
			</Tag>
		);

		return (asLayout
			? eco.layout<JsxRenderable>({
					integration: 'ecopages-jsx',
					identity,
					dependencies,
					render: (props) => renderMarkup({ ...props }),
				})
			: eco.component<Record<string, unknown>, JsxRenderable>({
					integration: 'ecopages-jsx',
					identity,
					dependencies,
					render: renderMarkup,
				})) as unknown as EcoComponent;
	},
	makeView({ text, layout, title, fail }) {
		return eco.page<Record<string, unknown>, JsxRenderable>({
			integration: 'ecopages-jsx',
			layout: layout as never,
			metadata: () => ({ title: title ?? 'Contract', description: title ?? 'Contract' }),
			render: () => {
				if (fail) {
					throw new Error(fail);
				}
				return <section>{text}</section>;
			},
		}) as unknown as EcoComponent;
	},
});

describe('EcopagesJsxRenderer', () => {
	describe('renderComponent', () => {
		it('serializes nested foreign children before delegating a string-first foreign shell', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const litPlugin = new StringChildContractPlugin('lit', '.lit.tsx');
			const config = await finalizeEcoPagesConfig({
				...outputDirs,
				robotsTxt: {
					preferences: {
						'*': [],
					},
				},
				integrations: [kitajsPlugin, litPlugin],
				defaultMetadata: {
					title: 'Ecopages',
					description: 'Ecopages',
				},
				baseUrl: 'http://localhost:3000',
			});

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
			const config = await finalizeEcoPagesConfig({
				...outputDirs,
				robotsTxt: {
					preferences: {
						'*': [],
					},
				},
				integrations: [kitajsPlugin, litPlugin],
				defaultMetadata: {
					title: 'Ecopages',
					description: 'Ecopages',
				},
				baseUrl: 'http://localhost:3000',
			});

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

		it('rejects opaque foreign children instead of coercing them to object text', () => {
			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
			const ForeignShell = eco.component({
				integration: 'kitajs',
				render: () => '<section>Foreign shell</section>',
			});
			const runtime = renderer.createTestForeignChildRuntime({
				component: ForeignShell,
				props: {},
			});

			expect(() =>
				runtime.interceptForeignChildSync?.({
					currentIntegration: 'ecopages-jsx',
					targetIntegration: 'kitajs',
					component: ForeignShell,
					props: { children: { opaque: true } },
				}),
			).toThrow(/foreign-subtree queue refused to coerce opaque foreign children/);
		});

		it('preserves normalized props when the delegated child stays inline', async () => {
			const kitajsPlugin = new StringChildContractPlugin('kitajs', '.kita.tsx');
			const config = await finalizeEcoPagesConfig({
				...outputDirs,
				robotsTxt: {
					preferences: {
						'*': [],
					},
				},
				integrations: [kitajsPlugin],
				defaultMetadata: {
					title: 'Ecopages',
					description: 'Ecopages',
				},
				baseUrl: 'http://localhost:3000',
			});

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
			const config = await finalizeEcoPagesConfig({
				...outputDirs,
				robotsTxt: {
					preferences: {
						'*': [],
					},
				},
				integrations: [kitajsPlugin, litPlugin],
				defaultMetadata: {
					title: 'Ecopages',
					description: 'Ecopages',
				},
				baseUrl: 'http://localhost:3000',
			});

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
			const config = await finalizeEcoPagesConfig({
				...outputDirs,
				robotsTxt: {
					preferences: {
						'*': [],
					},
				},
				integrations: [kitajsPlugin, litPlugin, reactPlugin],
				defaultMetadata: {
					title: 'Ecopages',
					description: 'Ecopages',
				},
				baseUrl: 'http://localhost:3000',
			});

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
			const config = await finalizeEcoPagesConfig({
				...outputDirs,
				robotsTxt: {
					preferences: {
						'*': [],
					},
				},
				integrations: [jsxPlugin, kitajsPlugin],
				defaultMetadata: {
					title: 'Ecopages',
					description: 'Ecopages',
				},
				baseUrl: 'http://localhost:3000',
			});

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
				identity: {
					id: 'generated-bounce-leaf',
					file: '/app/components/generated-bounce-leaf.eco.tsx',
					integration: 'ecopages-jsx',
				},
				integration: 'ecopages-jsx',
				render: () => <strong data-ecopages-jsx-leaf>Leaf</strong>,
			});

			const KitaGroup = eco.component<{}, string>({
				identity: {
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
				identity: {
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
				identity: {
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
				identity: {
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
});
