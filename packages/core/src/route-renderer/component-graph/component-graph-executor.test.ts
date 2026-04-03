import { describe, expect, it } from 'vitest';
import { createComponentMarker } from './component-marker.ts';
import { extractComponentGraph } from './component-graph.ts';
import { resolveComponentGraph } from './component-graph-executor.ts';

describe('component graph executor', () => {
	it('resolves markers bottom-up using graph levels', async () => {
		const html = [
			'<main>',
			createComponentMarker({
				nodeId: 'n_1',
				integration: 'lit',
				componentRef: 'c_parent',
				propsRef: 'p_parent',
				slotRef: 's_parent',
			}),
			createComponentMarker({
				nodeId: 'n_2',
				integration: 'react',
				componentRef: 'c_child',
				propsRef: 'p_child',
			}),
			'</main>',
		].join('');

		const graph = extractComponentGraph(html, {
			s_parent: ['n_2'],
		});

		const resolved = await resolveComponentGraph(html, graph, async (marker) => {
			if (marker.nodeId === 'n_2') {
				return { html: '<section>child</section>' };
			}
			return { html: '<article>parent</article>' };
		});

		expect(resolved).toContain('<article>parent</article>');
		expect(resolved).toContain('<section>child</section>');
		expect(resolved).not.toContain('<eco-marker');
	});

	it('resolves multi-level graphs in reverse topological order while preserving sibling order per level', async () => {
		const html = [
			'<main>',
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
				componentRef: 'c_first_child',
				propsRef: 'p_first_child',
			}),
			createComponentMarker({
				nodeId: 'n_3',
				integration: 'react',
				componentRef: 'c_second_child',
				propsRef: 'p_second_child',
				slotRef: 's_second_child',
			}),
			createComponentMarker({
				nodeId: 'n_4',
				integration: 'react',
				componentRef: 'c_leaf',
				propsRef: 'p_leaf',
			}),
			'</main>',
		].join('');

		const graph = extractComponentGraph(html, {
			s_root: ['n_2', 'n_3'],
			s_second_child: ['n_4'],
		});
		const visitedNodeIds: string[] = [];

		const resolved = await resolveComponentGraph(html, graph, async (marker) => {
			visitedNodeIds.push(marker.nodeId);
			return { html: `<section data-node-id="${marker.nodeId}">${marker.nodeId}</section>` };
		});

		expect(visitedNodeIds).toEqual(['n_4', 'n_2', 'n_3', 'n_1']);
		expect(resolved).toContain('<section data-node-id="n_2">n_2</section>');
		expect(resolved).toContain('<section data-node-id="n_4">n_4</section>');
		expect(resolved).toContain('<section data-node-id="n_3">n_3</section>');
		expect(resolved).toContain('<section data-node-id="n_1">n_1</section>');
		expect(resolved).not.toContain('<eco-marker');
	});

	it('resolves hidden child markers discovered from deferred parent props before visible parents', async () => {
		const hiddenChild = createComponentMarker({
			nodeId: 'n_2',
			integration: 'react',
			componentRef: 'c_child',
			propsRef: 'p_child',
		});
		const html = `<main>${createComponentMarker({
			nodeId: 'n_1',
			integration: 'react',
			componentRef: 'c_root',
			propsRef: 'p_root',
			slotRef: 's_root',
		})}</main>`;

		const graph = extractComponentGraph(
			html,
			{
				s_root: ['n_2'],
			},
			{
				p_root: { children: hiddenChild },
				p_child: { children: 'leaf-text' },
			},
		);
		const visitedNodeIds: string[] = [];

		const resolved = await resolveComponentGraph(html, graph, async (marker) => {
			visitedNodeIds.push(marker.nodeId);
			return {
				html:
					marker.nodeId === 'n_2'
						? '<section data-node-id="n_2">child</section>'
						: '<article data-node-id="n_1">parent</article>',
			};
		});

		expect(visitedNodeIds).toEqual(['n_2', 'n_1']);
		expect(resolved).toContain('<article data-node-id="n_1">parent</article>');
		expect(resolved).not.toContain('<eco-marker');
	});
});
