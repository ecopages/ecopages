import { describe, expect, it, vi } from 'vitest';
import { eco } from '../../../eco/eco.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	EcoComponent,
	ForeignSubtreeRenderPayload,
	HtmlTemplateProps,
} from '../../../types/public-types.ts';
import { runWithComponentRenderContext } from './component-render-context.ts';
import { IntegrationRenderer } from '../integration-renderer.ts';
import {
	TestIntegrationRenderer,
	createMockIntegrationPlugin,
	createUnresolvedMarkerArtifact,
	testAppConfig,
	testAssetService,
} from '../integration-renderer.test-fixtures.ts';

describe('renderer foreign-child delegation', () => {
	it('should expose a compatibility foreign-subtree payload contract', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		renderer.MockComponentRenderResult = {
			html: '<main data-root="true">Hello</main>',
			canAttachAttributes: true,
			rootTag: 'main',
			integrationName: 'test-renderer',
			rootAttributes: { 'data-eco-component-id': 'root-1' },
			assets: [
				{
					kind: 'script',
					inline: true,
					content: 'console.log("foreign-subtree")',
					position: 'body',
				},
			],
		};

		const payload = await renderer.testRenderForeignSubtree({
			component: (() => '<main>Hello</main>') as EcoComponent<Record<string, unknown>>,
			props: {},
		});

		expect(payload).toEqual<ForeignSubtreeRenderPayload>({
			html: '<main data-root="true">Hello</main>',
			assets: [
				{
					kind: 'script',
					inline: true,
					content: 'console.log("foreign-subtree")',
					position: 'body',
				},
			],
			rootTag: 'main',
			rootAttributes: { 'data-eco-component-id': 'root-1' },
			attachmentPolicy: { kind: 'first-element' },
			integrationName: 'test-renderer',
		});
	});

	it('should resolve foreign-owned boundaries in the owning renderer', () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const result = renderer.testShouldDelegateForeignChild({
			currentIntegration: 'ghtml',
			targetIntegration: 'react',
		});

		expect(result).toBe(true);
	});

	it('should keep same-integration boundaries in the current render pass', () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const result = renderer.testShouldDelegateForeignChild({
			currentIntegration: 'react',
			targetIntegration: 'react',
		});

		expect(result).toBe(false);
	});

	it('should delegate foreign component boundaries through the shared execution seam', async () => {
		const foreignRenderer = {
			name: 'foreign-renderer',
			renderComponentWithForeignChildren: vi.fn(async () => ({
				html: '<aside>Owned by foreign renderer</aside>',
				canAttachAttributes: true,
				rootTag: 'aside',
				integrationName: 'foreign-renderer',
			})),
		} as unknown as IntegrationRenderer;

		const initializeRenderer = vi.fn(() => foreignRenderer);
		const setup = vi.fn(async () => {});
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				integrations: [
					createMockIntegrationPlugin({
						name: 'foreign-renderer',
						initializeRenderer,
						setup,
					}),
				],
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		const result = await renderer.renderComponentWithForeignChildren({
			component: ForeignComponent,
			props: { label: 'foreign' },
			integrationContext: { rendererCache },
		});

		expect(result).toEqual(
			expect.objectContaining({
				html: '<aside>Owned by foreign renderer</aside>',
				integrationName: 'foreign-renderer',
			}),
		);
		expect(setup).toHaveBeenCalledTimes(1);
		expect(initializeRenderer).toHaveBeenCalledTimes(1);
		expect(foreignRenderer.renderComponentWithForeignChildren).toHaveBeenCalledTimes(1);
	});

	it('should preserve shared integration context fields when delegating to the owning renderer', async () => {
		const foreignRenderer = {
			renderComponentWithForeignChildren: vi.fn(async (input: ComponentRenderInput) => ({
				html: `<aside>${String(
					(input.integrationContext as BaseIntegrationContext | undefined)?.componentInstanceId ?? 'missing',
				)}</aside>`,
				canAttachAttributes: true,
				rootTag: 'aside',
				integrationName: 'foreign-renderer',
			})),
		} as unknown as IntegrationRenderer;
		const initializeRenderer = vi.fn(() => foreignRenderer);

		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				integrations: [
					createMockIntegrationPlugin({
						name: 'foreign-renderer',
						initializeRenderer,
					}),
				],
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		await renderer.renderComponentWithForeignChildren({
			component: ForeignComponent,
			props: { label: 'foreign' },
			integrationContext: {
				componentInstanceId: 'host-1',
			} satisfies BaseIntegrationContext,
		});

		expect(foreignRenderer.renderComponentWithForeignChildren).toHaveBeenCalledWith(
			expect.objectContaining({
				integrationContext: expect.objectContaining({
					componentInstanceId: 'host-1',
					rendererCache: expect.any(Map),
				}),
			}),
		);
	});

	it('should fall back to local rendering when the resolved owner renderer is the current renderer', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				integrations: [
					createMockIntegrationPlugin({
						name: 'foreign-renderer',
						initializeRenderer: () => renderer,
					}),
				],
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		renderer.MockComponentRenderResult = {
			html: '<aside>Local renderer</aside>',
			canAttachAttributes: true,
			rootTag: 'aside',
			integrationName: 'test-renderer',
		};

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		const result = await renderer.renderComponentWithForeignChildren({
			component: ForeignComponent,
			props: { label: 'foreign' },
			integrationContext: { rendererCache },
		});

		expect(result.html).toBe('<aside>Local renderer</aside>');
	});

	it('fails fast when a renderer without a foreign-child runtime crosses into a foreign owner', async () => {
		const foreignRenderer = {
			renderComponent: vi.fn(async () => ({
				html: '<span>resolved nested marker</span>',
				canAttachAttributes: true,
				rootTag: 'span',
				integrationName: 'foreign-renderer',
			})),
			renderComponentWithForeignChildren: vi.fn(async (input: ComponentRenderInput) =>
				foreignRenderer.renderComponent(input),
			),
		} as unknown as IntegrationRenderer;

		const appConfig = {
			...testAppConfig,
			integrations: [
				createMockIntegrationPlugin({
					name: 'foreign-renderer',
					initializeRenderer: () => foreignRenderer,
				}),
			],
		} as unknown as EcoPagesAppConfig;

		const renderer = new TestIntegrationRenderer({
			appConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		renderer.UseFailFastForeignChildRuntime = true;

		const ForeignComponent = eco.component<{}, string>({
			integration: 'foreign-renderer',
			render: () => '<span>foreign</span>',
		});

		const ShellComponent = eco.component<{ children?: string }, string>({
			integration: 'test-renderer',
			dependencies: {
				components: [ForeignComponent],
			},
			render: ({ children }) => `<section>${children ?? ''}${ForeignComponent({})}</section>`,
		});

		const passedThroughMarker = createUnresolvedMarkerArtifact('n_passed', 'passed-through-component', 'p_passed');

		await expect(
			renderer.renderComponentWithForeignChildren({
				component: ShellComponent,
				props: { children: passedThroughMarker },
				children: passedThroughMarker,
			}),
		).rejects.toThrow('without a renderer-owned foreign-child runtime');
		expect(foreignRenderer.renderComponent).toHaveBeenCalledTimes(0);
	});

	it('should not recursively resolve unresolved eco-marker artifacts that were only passed through resolved child html', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		renderer.MockComponentRenderResult = {
			html: '<section><eco-marker data-eco-node-id="n_2" data-eco-component-ref="nested-component" data-eco-props-ref="p_2"></eco-marker></section>',
			canAttachAttributes: true,
			rootTag: 'section',
			integrationName: 'test-renderer',
		};

		const Component = (() => '<section />') as EcoComponent<Record<string, unknown>>;
		Component.config = {
			integration: 'test-renderer',
			__eco: {
				id: 'component',
				file: '/app/components/component.ts',
				integration: 'test-renderer',
			},
		};

		await expect(
			renderer.renderComponentWithForeignChildren({
				component: Component,
				props: {},
				children: '<aside>already resolved child html</aside>',
			}),
		).resolves.toEqual(
			expect.objectContaining({
				html: '<section><eco-marker data-eco-node-id="n_2" data-eco-component-ref="nested-component" data-eco-props-ref="p_2"></eco-marker></section>',
			}),
		);
	});

	it('renders same-integration leaf components under their own integration context', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const LeafComponent = eco.component<{}, string>({
			integration: 'test-renderer',
			render: () => '<section>Leaf Render</section>',
		});

		const result = await runWithComponentRenderContext(
			{
				currentIntegration: 'foreign-renderer',
			},
			async () =>
				renderer.renderComponentWithForeignChildren({
					component: LeafComponent,
					props: {},
				}),
		);

		expect(result.value.html).toBe('<section>Leaf Render</section>');
		expect(result.value.html).not.toContain('<eco-marker');
		expect(renderer.ForeignChildRuntimeCreationCount).toBe(0);
	});

	it('uses inline partial rendering when no foreign children are present', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		const View = (() => '<section>Inline</section>') as EcoComponent<Record<string, unknown>>;
		View.config = {
			integration: 'test-renderer',
			__eco: {
				id: 'inline-view',
				file: '/app/components/inline-view.ts',
				integration: 'test-renderer',
			},
		};

		let inlineRenderCount = 0;
		const response = await renderer.testRenderPartialViewResponse({
			view: View,
			props: {},
			renderInline: async () => {
				inlineRenderCount += 1;
				return '<section>Inline</section>';
			},
		});

		expect(await response.text()).toBe('<section>Inline</section>');
		expect(inlineRenderCount).toBe(1);
		expect(renderer.ForeignChildRenderCount).toBe(0);
	});

	it('falls back to foreign-subtree partial rendering when compatibility is needed', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		const ForeignChild = (() => '<span>Foreign</span>') as EcoComponent<Record<string, unknown>>;
		ForeignChild.config = {
			integration: 'react',
			__eco: {
				id: 'foreign-child',
				file: '/app/components/foreign-child.tsx',
				integration: 'react',
			},
		};

		const View = (() => '<section>Foreign Subtree</section>') as EcoComponent<Record<string, unknown>>;
		View.config = {
			integration: 'test-renderer',
			__eco: {
				id: 'foreign-subtree-view',
				file: '/app/components/foreign-subtree-view.ts',
				integration: 'test-renderer',
			},
			dependencies: { components: [ForeignChild] },
		};
		renderer.MockComponentRenderResult = {
			html: '<section>Foreign Subtree</section>',
			canAttachAttributes: true,
			rootTag: 'section',
			integrationName: 'test-renderer',
		};

		let inlineRenderCount = 0;
		const response = await renderer.testRenderPartialViewResponse({
			view: View,
			props: {},
			renderInline: async () => {
				inlineRenderCount += 1;
				return '<section>Inline</section>';
			},
		});

		expect(await response.text()).toBe('<section>Foreign Subtree</section>');
		expect(inlineRenderCount).toBe(0);
		expect(renderer.ForeignChildRenderCount).toBe(1);
	});

	it('reuses one foreign renderer instance across shared view shell composition', async () => {
		const foreignRenderer = {
			renderComponentWithForeignChildren: vi.fn(async (input: ComponentRenderInput) => {
				const componentId = input.component.config?.__eco?.id;

				if (componentId === 'foreign-html-template') {
					return {
						html: `<html><body>${String(input.children ?? '')}</body></html>`,
						canAttachAttributes: true,
						rootTag: 'html',
						integrationName: 'foreign-renderer',
					};
				}

				if (componentId === 'foreign-layout') {
					return {
						html: `<main>${String(input.children ?? '')}</main>`,
						canAttachAttributes: true,
						rootTag: 'main',
						integrationName: 'foreign-renderer',
					};
				}

				return {
					html: '<section>Foreign View</section>',
					canAttachAttributes: true,
					rootTag: 'section',
					integrationName: 'foreign-renderer',
				};
			}),
		} as unknown as IntegrationRenderer;

		const initializeRenderer = vi.fn(() => foreignRenderer);
		const appConfig = {
			...testAppConfig,
			integrations: [
				createMockIntegrationPlugin({
					name: 'foreign-renderer',
					initializeRenderer,
				}),
			],
		} as unknown as EcoPagesAppConfig;

		const renderer = new TestIntegrationRenderer({
			appConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const View = (() => '<section>Foreign View</section>') as EcoComponent<Record<string, unknown>>;
		View.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-view',
				file: '/app/components/foreign-view.ts',
				integration: 'foreign-renderer',
			},
		};

		const Layout = (() => '<main />') as EcoComponent<Record<string, unknown>>;
		Layout.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-layout',
				file: '/app/components/foreign-layout.ts',
				integration: 'foreign-renderer',
			},
		};

		renderer.HtmlTemplate = (() => '<html><body></body></html>') as EcoComponent<HtmlTemplateProps>;
		renderer.HtmlTemplate.config = {
			integration: 'foreign-renderer',
			__eco: {
				id: 'foreign-html-template',
				file: '/app/components/foreign-html-template.ts',
				integration: 'foreign-renderer',
			},
		};

		const response = await renderer.testRenderViewWithDocumentShell({
			view: View,
			props: {},
			layout: Layout,
		});

		expect(await response.text()).toContain('<main><section>Foreign View</section></main>');
		expect(initializeRenderer).toHaveBeenCalledTimes(1);
		expect(foreignRenderer.renderComponentWithForeignChildren).toHaveBeenCalledTimes(3);
	});
});
