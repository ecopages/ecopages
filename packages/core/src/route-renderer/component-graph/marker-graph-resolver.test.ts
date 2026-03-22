import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '../../public-types.ts';
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
			integration: 'react',
			componentRef: 'nested-component',
			propsRef: 'p_1',
		})}</main>`;

		const result = await service.resolve({
			html,
			componentsToResolve: [Nested],
			graphContext: {
				propsByRef: {
					p_1: { count: 3 },
				},
				slotChildrenByRef: {},
			},
			resolveRenderer: () => ({ renderComponent }),
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

	it('should pass stable marker node ids as component instance ids for nested renders', async () => {
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
				integration: 'react',
				componentRef: 'nested-component',
				propsRef: 'p_1',
			})}</main>`,
			componentsToResolve: [Nested],
			graphContext: {
				propsByRef: {
					p_1: { count: 7 },
				},
				slotChildrenByRef: {},
			},
			resolveRenderer: () => ({ renderComponent }),
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

	it('should fail when marker props are missing', async () => {
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
					integration: 'react',
					componentRef: 'nested-component',
					propsRef: 'missing',
				}),
				componentsToResolve: [Nested],
				graphContext: { propsByRef: {}, slotChildrenByRef: {} },
				resolveRenderer: () => ({
					renderComponent: vi.fn(),
				}),
				applyAttributesToFirstElement: (fragment) => fragment,
			}),
		).rejects.toThrow('[ecopages] Missing props reference for marker: missing');
	});
});
