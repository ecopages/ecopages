import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent, ComponentRenderInput, ComponentRenderResult } from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service';
import { createComponentMarker } from './component-marker.ts';
import { MarkerGraphResolver } from './marker-graph-resolver.ts';

describe('MarkerGraphResolver', () => {
	it('should resolve markers with renderer output, assets, and root attributes', async () => {
		const service = new MarkerGraphResolver();
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: {
				id: 'nested-component',
				file: '/app/components/nested-component.tsx',
				integration: 'react',
			},
		};
		const renderComponent = vi.fn(async () => ({
			html: '<aside>Nested Render</aside>',
			canAttachAttributes: true,
			rootTag: 'aside',
			integrationName: 'react',
			rootAttributes: { 'data-eco-component-id': 'nested-1' },
			assets: [{ kind: 'script', srcUrl: '/assets/nested.js', position: 'head' } as ProcessedAsset],
		}));

		const html = `<main>${createComponentMarker({
			nodeId: 'n_1',
			componentRef: 'nested-component',
			propsRef: 'p_1',
		})}</main>`;

		const result = await service.resolve({
			html,
			componentsToResolve: [Nested],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: { count: 3 },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment, attributes) =>
				fragment.replace('<aside', `<aside data-eco-component-id="${attributes['data-eco-component-id']}"`),
		});

		expect(result.html).toContain('<aside data-eco-component-id="nested-1">Nested Render</aside>');
		expect(result.assets).toEqual([{ kind: 'script', srcUrl: '/assets/nested.js', position: 'head' }]);
		expect(renderComponent).toHaveBeenCalledWith({
			component: Nested,
			props: { count: 3 },
			children: undefined,
			integrationContext: {
				componentInstanceId: 'n_1',
			},
		});
	});

	it('should pass globally unique component instance ids for nested renders', async () => {
		const service = new MarkerGraphResolver();
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: {
				id: 'nested-component',
				file: '/app/components/nested-component.tsx',
				integration: 'react',
			},
		};
		const renderComponent = vi.fn(async () => ({
			html: '<aside>Nested Render</aside>',
			canAttachAttributes: true,
			rootTag: 'aside',
			integrationName: 'react',
		}));

		await service.resolve({
			html: `<main>${createComponentMarker({
				nodeId: 'n_42',
				componentRef: 'nested-component',
				propsRef: 'p_1',
			})}</main>`,
			componentsToResolve: [Nested],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: { count: 7 },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
		});

		expect(renderComponent).toHaveBeenCalledWith({
			component: Nested,
			props: { count: 7 },
			children: undefined,
			integrationContext: {
				componentInstanceId: 'n_42',
			},
		});
	});

	it('should prefix component instance ids with instanceIdScope when provided', async () => {
		const service = new MarkerGraphResolver();
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: {
				id: 'nested-component',
				file: '/app/components/nested-component.tsx',
				integration: 'react',
			},
		};
		const renderComponent = vi.fn(async () => ({
			html: '<aside>Nested Render</aside>',
			canAttachAttributes: true,
			rootTag: 'aside',
			integrationName: 'react',
		}));

		await service.resolve({
			html: `<main>${createComponentMarker({
				nodeId: 'n_1',
				componentRef: 'nested-component',
				propsRef: 'p_1',
			})}</main>`,
			componentsToResolve: [Nested],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: { count: 3 },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
			instanceIdScope: 'n_5',
		});

		expect(renderComponent).toHaveBeenCalledWith({
			component: Nested,
			props: { count: 3 },
			children: undefined,
			integrationContext: {
				componentInstanceId: 'n_5_n_1',
			},
		});
	});

	it('should pass detached top-level props objects into marker renders', async () => {
		const service = new MarkerGraphResolver();
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: {
				id: 'nested-detached-props',
				file: '/app/components/nested-detached-props.tsx',
				integration: 'react',
			},
		};
		const originalProps = { count: 7, children: '' };
		const renderComponent = vi.fn(async (_input: ComponentRenderInput) => ({
			html: '<aside>Nested Render</aside>',
			canAttachAttributes: true,
			rootTag: 'aside',
			integrationName: 'react',
		}));

		await service.resolve({
			html: `<main>${createComponentMarker({
				nodeId: 'n_42',
				componentRef: 'nested-detached-props',
				propsRef: 'p_1',
			})}</main>`,
			componentsToResolve: [Nested],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: originalProps,
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
		});

		const [{ props }] = renderComponent.mock.calls.map(([input]) => input as { props: Record<string, unknown> });
		expect(props).toEqual(originalProps);
		expect(props).not.toBe(originalProps);
	});

	it('preserves unresolved markers when marker props are missing', async () => {
		const service = new MarkerGraphResolver();
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			__eco: {
				id: 'nested-component',
				file: '/app/components/nested-component.tsx',
				integration: 'react',
			},
		};

		await expect(
			service.resolve({
				html: createComponentMarker({
					nodeId: 'n_1',
					componentRef: 'nested-component',
					propsRef: 'missing',
				}),
				componentsToResolve: [Nested],
				boundaryCapture: { capturedPropsByRef: {} },
				resolveRenderer: () => ({
					renderComponentBoundary: vi.fn(),
				}),
				applyAttributesToFirstElement: (fragment) => fragment,
			}),
		).resolves.toEqual({
			assets: [],
			html: '<eco-marker data-eco-node-id="n_1" data-eco-component-ref="nested-component" data-eco-props-ref="missing"></eco-marker>',
		});
	});

	it('should stitch deep multi-level slot children bottom-up before rendering parents', async () => {
		const service = new MarkerGraphResolver();
		const Leaf = (() => '<span>Leaf</span>') as EcoComponent<Record<string, unknown>>;
		Leaf.config = {
			integration: 'react',
			__eco: {
				id: 'leaf-component',
				file: '/app/components/leaf-component.tsx',
				integration: 'react',
			},
		};
		const Parent = (() => '<section>Parent</section>') as EcoComponent<Record<string, unknown>>;
		Parent.config = {
			integration: 'react',
			__eco: {
				id: 'parent-component',
				file: '/app/components/parent-component.tsx',
				integration: 'react',
			},
		};
		const Root = (() => '<article>Root</article>') as EcoComponent<Record<string, unknown>>;
		Root.config = {
			integration: 'react',
			__eco: {
				id: 'root-component',
				file: '/app/components/root-component.tsx',
				integration: 'react',
			},
		};
		const renderOrder: string[] = [];
		const renderComponent = vi.fn(async (input: ComponentRenderInput) => {
			const componentId = input.component.config?.__eco?.id;
			renderOrder.push(componentId as string);

			if (componentId === 'leaf-component') {
				return {
					html: '<span>leaf</span>',
					canAttachAttributes: true,
					rootTag: 'span',
					integrationName: 'react',
				};
			}

			if (componentId === 'parent-component') {
				return {
					html: `<section>${input.children ?? ''}</section>`,
					canAttachAttributes: true,
					rootTag: 'section',
					integrationName: 'react',
				};
			}

			return {
				html: `<article>${input.children ?? ''}</article>`,
				canAttachAttributes: true,
				rootTag: 'article',
				integrationName: 'react',
			};
		});

		const parentMarker = createComponentMarker({
			nodeId: 'n_2',
			componentRef: 'parent-component',
			propsRef: 'p_2',
		});
		const leafMarker = createComponentMarker({
			nodeId: 'n_3',
			componentRef: 'leaf-component',
			propsRef: 'p_3',
		});
		const html = `<main>${createComponentMarker({
			nodeId: 'n_1',
			componentRef: 'root-component',
			propsRef: 'p_1',
		})}</main>`;

		const result = await service.resolve({
			html,
			componentsToResolve: [Root, Parent, Leaf],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: { id: 'root', children: parentMarker },
					p_2: { id: 'parent', children: leafMarker },
					p_3: { id: 'leaf', children: 'leaf-text' },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
		});

		expect(renderOrder).toEqual(['leaf-component', 'parent-component', 'root-component']);
		expect(result.html).toContain('<article><section><span>leaf</span></section></article>');
		expect(renderComponent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				component: Parent,
				children: '<span>leaf</span>',
			}),
		);
		expect(renderComponent).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				component: Root,
				children: '<section><span>leaf</span></section>',
			}),
		);
	});

	it('preserves surrounding serialized html when slot children contain deferred markers', async () => {
		const service = new MarkerGraphResolver();
		const Root = (() => '') as unknown as EcoComponent<object>;
		const Leaf = (() => '') as unknown as EcoComponent<object>;
		Root.config = {
			__eco: { id: 'root-component', file: '/root.tsx', integration: 'react' },
			integration: 'react',
			dependencies: { components: [Leaf] },
		};
		Leaf.config = {
			__eco: { id: 'leaf-component', file: '/leaf.tsx', integration: 'react' },
			integration: 'react',
		};

		const leafMarker = createComponentMarker({
			nodeId: 'n_2',
			componentRef: 'leaf-component',
			propsRef: 'p_2',
		});
		const html = `<main>${createComponentMarker({
			nodeId: 'n_1',
			componentRef: 'root-component',
			propsRef: 'p_1',
		})}</main>`;

		const renderComponent = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => {
			if (input.component === Leaf) {
				return {
					html: '<span>leaf</span>',
					canAttachAttributes: true,
					rootTag: 'span',
					integrationName: 'react',
				};
			}

			return {
				html: `<article>${input.children ?? ''}</article>`,
				canAttachAttributes: true,
				rootTag: 'article',
				integrationName: 'react',
			};
		});

		const result = await service.resolve({
			html,
			componentsToResolve: [Root, Leaf],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: { children: `<div class="shell">before${leafMarker}after</div>` },
					p_2: { children: 'leaf-text' },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
		});

		expect(result.html).toContain('<article><div class="shell">before<span>leaf</span>after</div></article>');
		expect(renderComponent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				component: Root,
				children: '<div class="shell">before<span>leaf</span>after</div>',
			}),
		);
	});

	it('preserves uncaptured pass-through markers inside serialized children', async () => {
		const service = new MarkerGraphResolver();
		const Root = (() => '') as unknown as EcoComponent<object>;
		const Leaf = (() => '') as unknown as EcoComponent<object>;
		Root.config = {
			__eco: { id: 'root-component', file: '/root.tsx', integration: 'react' },
			integration: 'react',
			dependencies: { components: [Leaf] },
		};
		Leaf.config = {
			__eco: { id: 'leaf-component', file: '/leaf.tsx', integration: 'react' },
			integration: 'react',
		};

		const passedThroughMarker = createComponentMarker({
			nodeId: 'n_passed',
			componentRef: 'passed-through-component',
			propsRef: 'p_passed',
		});
		const leafMarker = createComponentMarker({
			nodeId: 'n_2',
			componentRef: 'leaf-component',
			propsRef: 'p_2',
		});
		const html = `<main>${createComponentMarker({
			nodeId: 'n_1',
			componentRef: 'root-component',
			propsRef: 'p_1',
		})}</main>`;

		const renderComponent = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => {
			if (input.component === Leaf) {
				return {
					html: '<span>leaf</span>',
					canAttachAttributes: true,
					rootTag: 'span',
					integrationName: 'react',
				};
			}

			return {
				html: `<article>${input.children ?? ''}</article>`,
				canAttachAttributes: true,
				rootTag: 'article',
				integrationName: 'react',
			};
		});

		const result = await service.resolve({
			html,
			componentsToResolve: [Root, Leaf],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: { children: `<div>before${passedThroughMarker}${leafMarker}after</div>` },
					p_2: { children: 'leaf-text' },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
		});

		expect(result.html).toContain(
			`<article><div>before${passedThroughMarker}<span>leaf</span>after</div></article>`,
		);
	});

	it('preserves source order for fan-out children resolved in the same level', async () => {
		const service = new MarkerGraphResolver();
		const Root = (() => '') as unknown as EcoComponent<object>;
		const First = (() => '') as unknown as EcoComponent<object>;
		const Second = (() => '') as unknown as EcoComponent<object>;
		Root.config = {
			__eco: { id: 'root-component', file: '/root.tsx', integration: 'react' },
			integration: 'react',
			dependencies: { components: [First, Second] },
		};
		First.config = {
			__eco: { id: 'first-component', file: '/first.tsx', integration: 'react' },
			integration: 'react',
		};
		Second.config = {
			__eco: { id: 'second-component', file: '/second.tsx', integration: 'react' },
			integration: 'react',
		};

		const renderOrder: string[] = [];
		const renderComponent = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => {
			const componentId = input.component.config?.__eco?.id as string;
			renderOrder.push(componentId);

			return {
				html: `<section>${componentId}</section>`,
				canAttachAttributes: true,
				rootTag: 'section',
				integrationName: 'react',
			};
		});

		const html = `<main>${createComponentMarker({
			nodeId: 'n_1',
			componentRef: 'root-component',
			propsRef: 'p_1',
		})}${createComponentMarker({
			nodeId: 'n_2',
			componentRef: 'first-component',
			propsRef: 'p_2',
		})}${createComponentMarker({
			nodeId: 'n_3',
			componentRef: 'second-component',
			propsRef: 'p_3',
		})}</main>`;

		await service.resolve({
			html,
			componentsToResolve: [Root, First, Second],
			boundaryCapture: {
				capturedPropsByRef: {
					p_1: {
						children: `${createComponentMarker({
							nodeId: 'n_2',
							componentRef: 'first-component',
							propsRef: 'p_2',
						})}${createComponentMarker({
							nodeId: 'n_3',
							componentRef: 'second-component',
							propsRef: 'p_3',
						})}`,
					},
					p_2: { children: 'first' },
					p_3: { children: 'second' },
				},
			},
			resolveRenderer: () => ({ renderComponentBoundary: renderComponent }),
			applyAttributesToFirstElement: (fragment) => fragment,
		});

		expect(renderOrder).toEqual(['first-component', 'second-component', 'root-component']);
	});

	it('throws when deferred slot links contain a cycle', async () => {
		const service = new MarkerGraphResolver();
		const First = (() => '') as unknown as EcoComponent<object>;
		const Second = (() => '') as unknown as EcoComponent<object>;
		First.config = {
			__eco: { id: 'first-component', file: '/first.tsx', integration: 'react' },
			integration: 'react',
			dependencies: { components: [Second] },
		};
		Second.config = {
			__eco: { id: 'second-component', file: '/second.tsx', integration: 'react' },
			integration: 'react',
			dependencies: { components: [First] },
		};

		await expect(
			service.resolve({
				html: `${createComponentMarker({
					nodeId: 'n_1',
					componentRef: 'first-component',
					propsRef: 'p_1',
				})}${createComponentMarker({
					nodeId: 'n_2',
					componentRef: 'second-component',
					propsRef: 'p_2',
				})}`,
				componentsToResolve: [First, Second],
				boundaryCapture: {
					capturedPropsByRef: {
						p_1: {
							children: createComponentMarker({
								nodeId: 'n_2',
								componentRef: 'second-component',
								propsRef: 'p_2',
							}),
						},
						p_2: {
							children: createComponentMarker({
								nodeId: 'n_1',
								componentRef: 'first-component',
								propsRef: 'p_1',
							}),
						},
					},
				},
				resolveRenderer: () => ({ renderComponentBoundary: vi.fn() }),
				applyAttributesToFirstElement: (fragment) => fragment,
			}),
		).rejects.toThrow('Component marker graph contains a cycle');
	});
});
