import { describe, expect, it } from 'vitest';
import { LitPlugin } from '../lit.plugin.ts';

describe('LitPlugin', () => {
	it('keeps the global hydrate-support bootstrap stable across browser-router swaps', () => {
		const plugin = new LitPlugin();
		const [dependency] = plugin.getDependencies();

		expect(dependency).toMatchObject({
			attributes: {
				'data-eco-script-id': 'lit-hydrate-support',
			},
		});
		expect(dependency.attributes?.['data-eco-rerun']).toBeUndefined();
	});
});