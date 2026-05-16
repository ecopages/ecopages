import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { jsx as kitajsx, jsxs as kitajsxs } from '@kitajs/html/jsx-runtime';
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
import { createDeferredIntegrationPlugin, createTestAppConfig } from '@ecopages/testing';
import { KitaRenderer } from '../kitajs-renderer.ts';

type MarkupNodeLike = {
	nodeType: number;
	outerHTML: string;
};

const Config = await createTestAppConfig();

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class EcopagesJsxForeignRenderer extends IntegrationRenderer<MarkupNodeLike> {
	name = 'ecopages-jsx';

	async render(): Promise<string> {
		return '';
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const component = input.component as (props: Record<string, unknown>) => MarkupNodeLike;
		const rendered = component(input.props);

		return {
			html: rendered.outerHTML,
			canAttachAttributes: true,
			rootTag: 'strong',
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

class EcopagesJsxForeignPlugin extends IntegrationPlugin<MarkupNodeLike> {
	renderer = EcopagesJsxForeignRenderer;

	constructor() {
		super({
			name: 'ecopages-jsx',
			extensions: ['.eco.tsx'],
		});
	}
}

class TestKitaRenderer extends KitaRenderer {
	PageModules = new Map<string, { default: EcoComponent<any> }>();

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate;
	}

	protected override async resolveDependencies(): Promise<[]> {
		return [];
	}
}

/**
 * Creates a typed test component that satisfies EcoComponent without
 * requiring `as unknown as` double-casts.
 */
function createTestComponent<P>(fn: (props: P) => Promise<string> | string): EcoComponent<P> {
	return fn as EcoComponent<P>;
}

const renderer = new TestKitaRenderer({
	appConfig: Config,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

const createRendererWithAssets = () => {
	const assetProcessingService = {
		processDependencies: vi.fn(async () => [
			{
				kind: 'script',
				srcUrl: '/assets/kita-island.js',
				position: 'head',
			},
		]),
	};

	return {
		renderer: new TestKitaRenderer({
			appConfig: Config,
			assetProcessingService: assetProcessingService as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		}),
		assetProcessingService,
	};
};

describe('KitaRenderer', () => {
	it('should render a single component with renderComponent', async () => {
		const Component = createTestComponent<{ title: string }>(async (props) => `<h2>${props.title}</h2>`);

		const result = await renderer.renderComponent({
			component: Component,
			props: { title: 'Kita Component' },
		});

		expect(result.integrationName).toBe('kitajs');
		expect(result.canAttachAttributes).toBe(true);
		expect(result.rootTag).toBe('h2');
		expect(result.html).toContain('<h2>Kita Component</h2>');
	});

	it('should include component assets when dependencies are declared', async () => {
		const { renderer, assetProcessingService } = createRendererWithAssets();
		const Component = createTestComponent<{ title: string }>(async (props) => `<h2>${props.title}</h2>`);
		Component.config = {
			__eco: {
				id: 'kita-comp',
				file: '/project/src/components/kita-comp.kita.tsx',
				integration: 'kitajs',
			},
			dependencies: {
				scripts: ['./kita-comp.script.ts'],
			},
		};

		const result = await renderer.renderComponent({
			component: Component,
			props: { title: 'Kita Assets' },
		});

		expect(assetProcessingService.processDependencies).toHaveBeenCalled();
		expect(result.assets).toBeDefined();
		expect(result.assets?.[0]?.srcUrl).toBe('/assets/kita-island.js');
	});

	it('should expose the compatibility foreign-subtree payload contract', async () => {
		const Component = createTestComponent(async () => '<section>Kita Foreign Subtree</section>');

		const result = await renderer.renderForeignSubtree({
			component: Component,
			props: {},
		});

		expect(result).toEqual<ForeignSubtreeRenderPayload>({
			html: '<section>Kita Foreign Subtree</section>',
			assets: [],
			rootTag: 'section',
			rootAttributes: undefined,
			attachmentPolicy: { kind: 'first-element' },
			integrationName: 'kitajs',
		});
	});

	it('should resolve foreign boundaries inside the Kita renderer and bubble nested assets', async () => {
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
						content: 'console.log("deferred-kita")',
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

		deferredPlugin.setConfig(config);
		deferredPlugin.setRuntimeOrigin('http://localhost:3000');

		const testRenderer = new TestKitaRenderer({
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

		const Shell = eco.component<{ children?: string }, string>({
			integration: 'kitajs',
			dependencies: {
				components: [DeferredWidget],
			},
			render: ({ children }) => `<main>${children ?? ''}${DeferredWidget({})}</main>`,
		});

		const result = await testRenderer.renderComponentWithForeignChildren({
			component: Shell,
			props: {},
			children: '<section>Host child</section>',
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
			Page: createTestComponent(async () => 'Hello World'),
			HtmlTemplate,
		});

		expect(body).toBe('<!DOCTYPE html><html><body>Hello World</body></html>');
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
				Page: createTestComponent(async () => {
					throw new Error('Page failed to render');
				}),
				HtmlTemplate,
			}),
		).rejects.toThrow('Error rendering page');
	});

	it('should resolve deferred cross-integration layout components in render', async () => {
		const deferredPlugin = createDeferredIntegrationPlugin();
		const config = await createTestAppConfig({
			integrations: [deferredPlugin],
		});

		deferredPlugin.setConfig(config);
		deferredPlugin.setRuntimeOrigin('http://localhost:3000');

		const DeferredWidget = eco.component({
			__eco: {
				id: 'deferred-widget',
				file: '/app/components/deferred-widget.deferred.tsx',
				integration: 'deferred',
			},
			integration: 'deferred',
			render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
		});

		const Layout = eco.layout<string>({
			dependencies: {
				components: [DeferredWidget],
			},
			render: ({ children }) => `<main>${children}${DeferredWidget({})}</main>`,
		});

		const Page = eco.page({
			integration: 'kitajs',
			layout: Layout,
			render: () => '<section>Route page</section>',
		});

		const testRenderer = new TestKitaRenderer({
			appConfig: config,
			assetProcessingService: {} as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

		const body = await testRenderer.render({
			params: {},
			query: {},
			props: {},
			file: '/app/pages/index.tsx',
			resolvedDependencies: [],
			metadata: {
				title: 'Route page',
				description: 'Route page',
			},
			Page: Page as unknown as EcoComponent<Record<string, unknown>>,
			Layout: Layout as unknown as EcoComponent<Record<string, unknown>>,
			HtmlTemplate,
		});

		expect(body).toContain('<section>Route page</section>');
		expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
		expect(body).not.toContain('<eco-marker');
	});

	it('should resolve deferred cross-integration layout components in renderToResponse', async () => {
		const deferredPlugin = createDeferredIntegrationPlugin();
		const config = await createTestAppConfig({
			integrations: [deferredPlugin],
		});

		deferredPlugin.setConfig(config);
		deferredPlugin.setRuntimeOrigin('http://localhost:3000');

		const DeferredWidget = eco.component({
			__eco: {
				id: 'deferred-widget',
				file: '/app/components/deferred-widget.deferred.tsx',
				integration: 'deferred',
			},
			integration: 'deferred',
			render: () => '<button data-testid="deferred-widget">Deferred widget</button>',
		});

		const Layout = eco.layout({
			dependencies: {
				components: [DeferredWidget],
			},
			render: ({ children }) => {
				return (
					<main>
						{children}
						<DeferredWidget />
					</main>
				);
			},
		});

		const View = eco.page({
			integration: 'kitajs',
			layout: Layout,
			render: () => '<section>Explicit page</section>',
		});

		const testRenderer = new TestKitaRenderer({
			appConfig: config,
			assetProcessingService: {} as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

		const response = await testRenderer.renderToResponse(View, {}, {});
		const body = await response.text();

		expect(body).toContain('<section>Explicit page</section>');
		expect(body).toContain('<button data-testid="deferred-widget">Deferred widget</button>');
		expect(body).not.toContain('<eco-marker');
	});

	it('renders an Ecopages JSX child through the real Kita JSX runtime', async () => {
		const jsxPlugin = new EcopagesJsxForeignPlugin();
		const kitaPlugin = new (class extends IntegrationPlugin<EcoPagesElement> {
			renderer = KitaRenderer;

			constructor() {
				super({
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				});
			}
		})();

		const config = await createTestAppConfig({
			integrations: [jsxPlugin, kitaPlugin],
		});

		const testRenderer = new TestKitaRenderer({
			appConfig: config,
			assetProcessingService: {
				processDependencies: vi.fn(async () => []),
			} as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

		const EcopagesJsxLeaf = eco.component<{}, MarkupNodeLike>({
			__eco: {
				id: 'kitajs-foreign-ecopages-jsx-leaf',
				file: '/app/components/kitajs-foreign-ecopages-jsx-leaf.eco.tsx',
				integration: 'ecopages-jsx',
			},
			integration: 'ecopages-jsx',
			render: () => ({
				nodeType: 1,
				outerHTML: '<strong data-ecopages-jsx-leaf="true">Leaf</strong>',
			}),
		});

		const KitaHost = eco.component<{}, EcoPagesElement>({
			__eco: {
				id: 'kitajs-foreign-ecopages-jsx-host',
				file: '/app/components/kitajs-foreign-ecopages-jsx-host.kita.tsx',
				integration: 'kitajs',
			},
			integration: 'kitajs',
			dependencies: {
				components: [EcopagesJsxLeaf],
			},
			render: () =>
				kitajsxs('div', {
					'data-testid': 'kitajs-foreign-host',
					children: [kitajsx('span', { children: 'before' }), kitajsx(EcopagesJsxLeaf, {})],
				}) as unknown as EcoPagesElement,
		});

		const result = await testRenderer.renderComponentWithForeignChildren({
			component: KitaHost,
			props: {},
			integrationContext: {
				componentInstanceId: 'kitajs-foreign-ecopages-jsx-host',
			},
		});

		expect(result.html).toContain('data-testid="kitajs-foreign-host"');
		expect(result.html).toContain('<strong data-ecopages-jsx-leaf="true">Leaf</strong>');
	});
});
