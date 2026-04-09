import { describe, expect, it } from 'vitest';
import { eco, type EcoComponent } from '@ecopages/core';
import { KitaHtmlPlugin } from '../kitajs.plugin.ts';

describe('KitaHtmlPlugin', () => {
	it('defers boundaries when entering Kita from another integration', () => {
		const plugin = new KitaHtmlPlugin();
		const component = eco.component({
			integration: 'kitajs',
			render: () => '<section>Kita</section>',
		}) as EcoComponent<Record<string, unknown>>;

		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'lit',
				targetIntegration: 'kitajs',
				component,
			}),
		).toBe(true);
	});

	it('does not defer boundaries when already rendering inside Kita', () => {
		const plugin = new KitaHtmlPlugin();
		const component = eco.component({
			integration: 'kitajs',
			render: () => '<section>Kita</section>',
		}) as EcoComponent<Record<string, unknown>>;

		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'kitajs',
				targetIntegration: 'kitajs',
				component,
			}),
		).toBe(false);
	});
});
