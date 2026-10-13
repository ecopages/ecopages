import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import { LitPlugin } from '../lit.plugin.ts';

describe('LitPlugin', () => {
	it('keeps the global hydrate-support bootstrap stable across browser-router swaps', () => {
		const plugin = new LitPlugin();
		const [dependency] = plugin.getDependencies();

		expect(dependency).toMatchObject({
			kind: 'script',
			source: 'content',
			inline: true,
			attributes: {
				'data-eco-script-id': 'lit-hydrate-support',
			},
		});
		expect(dependency.attributes?.['data-eco-rerun']).toBeUndefined();

		if (dependency.kind !== 'script' || dependency.source !== 'content') {
			throw new Error('Expected Lit hydrate dependency to be an inline content script');
		}

		expect(dependency.content).toContain('(() => {');
		expect(dependency.content).toContain('globalThis.litElementHydrateSupport');
	});
});

describe('LitPlugin render session invalidation', () => {
	it('reads the invalidation version from the app module loader generation', () => {
		let generation = 0;
		const appConfig = {
			rootDir: '/app',
			srcDir: 'src',
			runtime: {
				appModuleLoader: {
					importModule: async () => ({}),
					invalidateDevelopmentGraph: () => {
						generation += 1;
					},
					getDevelopmentGeneration: () => generation,
				},
			},
		} as unknown as EcoPagesAppConfig;

		const plugin = new LitPlugin();
		plugin.setConfig(appConfig);
		const session = plugin['createRenderSession']();

		expect(session['getInvalidationVersion']()).toBe(0);

		appConfig.runtime?.appModuleLoader?.invalidateDevelopmentGraph();

		expect(session['getInvalidationVersion']()).toBe(1);
	});
});
