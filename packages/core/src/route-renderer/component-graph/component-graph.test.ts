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
