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
});
