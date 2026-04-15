import { describe, expect, it } from 'vitest';
import { createComponentMarker, parseComponentMarkers } from './component-marker.ts';

describe('component marker contract', () => {
	it('creates a canonical marker element', () => {
		const html = createComponentMarker({
			nodeId: 'n_1',
			componentRef: 'c_1',
			propsRef: 'p_1',
		});

		expect(html).toContain('<eco-marker');
		expect(html).toContain('data-eco-node-id="n_1"');
		expect(html).toContain('data-eco-component-ref="c_1"');
		expect(html).toContain('data-eco-props-ref="p_1"');
	});

	it('parses multiple markers from html', () => {
		const html = [
			'<main>',
			createComponentMarker({
				nodeId: 'n_1',
				componentRef: 'c_1',
				propsRef: 'p_1',
			}),
			createComponentMarker({
				nodeId: 'n_2',
				componentRef: 'c_2',
				propsRef: 'p_2',
			}),
			'</main>',
		].join('');

		const markers = parseComponentMarkers(html);
		expect(markers).toHaveLength(2);
		expect(markers[0]).toEqual({
			nodeId: 'n_1',
			componentRef: 'c_1',
			propsRef: 'p_1',
		});
		expect(markers[1]).toEqual({
			nodeId: 'n_2',
			componentRef: 'c_2',
			propsRef: 'p_2',
		});
	});

	it('ignores malformed markers missing required fields', () => {
		const html =
			'<eco-marker data-eco-node-id="n_1"></eco-marker>' +
			createComponentMarker({
				nodeId: 'n_2',
				componentRef: 'c_2',
				propsRef: 'p_2',
			});

		const markers = parseComponentMarkers(html);
		expect(markers).toHaveLength(1);
		expect(markers[0]?.nodeId).toBe('n_2');
	});
});
