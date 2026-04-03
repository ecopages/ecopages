import { describe, expect, it } from 'vitest';
import { createComponentMarker } from './component-marker.ts';
import { extractComponentGraph } from './component-graph.ts';

describe('component graph extraction', () => {
	it('extracts nodes in deterministic order without slot links', () => {
		const html = [
			createComponentMarker({ nodeId: 'n_1', integration: 'lit', componentRef: 'c_1', propsRef: 'p_1' }),
			createComponentMarker({ nodeId: 'n_2', integration: 'react', componentRef: 'c_2', propsRef: 'p_2' }),
		].join('');

		const graph = extractComponentGraph(html);
		expect([...graph.nodes.keys()]).toEqual(['n_1', 'n_2']);
		expect(graph.levels).toEqual([['n_1', 'n_2']]);
	});

	it('builds parent child edges from slot registry', () => {
		const html = [
			createComponentMarker({
				nodeId: 'n_1',
				integration: 'lit',
				componentRef: 'c_1',
				propsRef: 'p_1',
				slotRef: 's_1',
			}),
			createComponentMarker({ nodeId: 'n_2', integration: 'react', componentRef: 'c_2', propsRef: 'p_2' }),
		].join('');

		const graph = extractComponentGraph(html, {
			s_1: ['n_2'],
		});

		expect(graph.edges.get('n_1')).toEqual(new Set(['n_2']));
		expect(graph.reverseEdges.get('n_2')).toEqual(new Set(['n_1']));
		expect(graph.levels).toEqual([['n_1'], ['n_2']]);
	});

	it('builds multi-level slot graphs in deterministic topological levels', () => {
		const html = [
			createComponentMarker({
				nodeId: 'n_1',
				integration: 'lit',
				componentRef: 'c_root',
				propsRef: 'p_root',
				slotRef: 's_root',
			}),
			createComponentMarker({
				nodeId: 'n_2',
				integration: 'react',
				componentRef: 'c_middle',
				propsRef: 'p_middle',
				slotRef: 's_middle',
			}),
			createComponentMarker({
				nodeId: 'n_3',
				integration: 'react',
				componentRef: 'c_leaf',
				propsRef: 'p_leaf',
			}),
		].join('');

		const graph = extractComponentGraph(html, {
			s_root: ['n_2'],
			s_middle: ['n_3'],
		});

		expect(graph.edges.get('n_1')).toEqual(new Set(['n_2']));
		expect(graph.edges.get('n_2')).toEqual(new Set(['n_3']));
		expect(graph.reverseEdges.get('n_2')).toEqual(new Set(['n_1']));
		expect(graph.reverseEdges.get('n_3')).toEqual(new Set(['n_2']));
		expect(graph.levels).toEqual([['n_1'], ['n_2'], ['n_3']]);
	});

	it('discovers deep child markers captured inside deferred parent props', () => {
		const middleMarker = createComponentMarker({
			nodeId: 'n_2',
			integration: 'react',
			componentRef: 'c_middle',
			propsRef: 'p_middle',
			slotRef: 's_middle',
		});
		const leafMarker = createComponentMarker({
			nodeId: 'n_3',
			integration: 'react',
			componentRef: 'c_leaf',
			propsRef: 'p_leaf',
		});
		const html = createComponentMarker({
			nodeId: 'n_1',
			integration: 'react',
			componentRef: 'c_root',
			propsRef: 'p_root',
			slotRef: 's_root',
		});

		const graph = extractComponentGraph(
			html,
			{
				s_root: ['n_2'],
				s_middle: ['n_3'],
			},
			{
				p_root: { children: middleMarker },
				p_middle: { children: leafMarker },
				p_leaf: { children: 'leaf-text' },
			},
		);

		expect([...graph.nodes.keys()]).toEqual(['n_1', 'n_2', 'n_3']);
		expect(graph.edges.get('n_1')).toEqual(new Set(['n_2']));
		expect(graph.edges.get('n_2')).toEqual(new Set(['n_3']));
		expect(graph.levels).toEqual([['n_1'], ['n_2'], ['n_3']]);
	});

	it('preserves source order for fan-out children in the same level', () => {
		const html = [
			createComponentMarker({
				nodeId: 'n_1',
				integration: 'lit',
				componentRef: 'c_root',
				propsRef: 'p_root',
				slotRef: 's_root',
			}),
			createComponentMarker({
				nodeId: 'n_2',
				integration: 'react',
				componentRef: 'c_first',
				propsRef: 'p_first',
			}),
			createComponentMarker({
				nodeId: 'n_3',
				integration: 'react',
				componentRef: 'c_second',
				propsRef: 'p_second',
			}),
		].join('');

		const graph = extractComponentGraph(html, {
			s_root: ['n_2', 'n_3'],
		});

		expect(graph.levels).toEqual([['n_1'], ['n_2', 'n_3']]);
	});

	it('throws when slot links create cycles', () => {
		const html = [
			createComponentMarker({
				nodeId: 'n_1',
				integration: 'lit',
				componentRef: 'c_1',
				propsRef: 'p_1',
				slotRef: 's_1',
			}),
			createComponentMarker({
				nodeId: 'n_2',
				integration: 'react',
				componentRef: 'c_2',
				propsRef: 'p_2',
				slotRef: 's_2',
			}),
		].join('');

		expect(() =>
			extractComponentGraph(html, {
				s_1: ['n_2'],
				s_2: ['n_1'],
			}),
		).toThrow('Component marker graph contains a cycle');
	});
});
