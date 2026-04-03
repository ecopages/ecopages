import { describe, expect, it } from 'vitest';
import { eco, type EcoComponent } from '@ecopages/core';
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

	it('defers boundaries when entering Lit from another integration', () => {
		const plugin = new LitPlugin();
		const component = eco.component({
			integration: 'lit',
			render: () => '<lit-shell></lit-shell>',
		}) as EcoComponent<Record<string, unknown>>;

		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'kitajs',
				targetIntegration: 'lit',
				component,
			}),
		).toBe(true);
	});

	it('does not defer boundaries when already rendering inside Lit', () => {
		const plugin = new LitPlugin();
		const component = eco.component({
			integration: 'lit',
			render: () => '<lit-shell></lit-shell>',
		}) as EcoComponent<Record<string, unknown>>;

		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'lit',
				targetIntegration: 'lit',
				component,
			}),
		).toBe(false);
	});
});
