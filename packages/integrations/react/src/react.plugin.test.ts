import { describe, expect, it } from 'vitest';
import { eco, type EcoComponent } from '@ecopages/core';
import { ReactPlugin } from './react.plugin.ts';

describe('ReactPlugin', () => {
	it('should expose runtime specifier mappings through the base integration hook', () => {
		const plugin = new ReactPlugin();

		expect(plugin.getRuntimeSpecifierMap()).toMatchObject({
			react: '/assets/vendors/react.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
		});
	});

	it('should defer boundaries when entering React from another integration', () => {
		const plugin = new ReactPlugin();
		const component = eco.component({
			integration: 'react',
			render: () => '<div>React</div>',
		}) as EcoComponent<Record<string, unknown>>;

		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'ghtml',
				targetIntegration: 'react',
				component,
			}),
		).toBe(true);
	});

	it('should not defer boundaries when already rendering inside React', () => {
		const plugin = new ReactPlugin();
		const component = eco.component({
			integration: 'react',
			render: () => '<div>React</div>',
		}) as EcoComponent<Record<string, unknown>>;

		expect(
			plugin.shouldDeferComponentBoundary({
				currentIntegration: 'react',
				targetIntegration: 'react',
				component,
			}),
		).toBe(false);
	});
});
