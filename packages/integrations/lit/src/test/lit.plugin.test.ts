import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { StaticExportContext } from '@ecopages/core/plugins/integration-plugin';
import { LitPlugin } from '../lit.plugin.ts';
import { LitStaticRenderSession } from '../lit-static-render-session.ts';

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

describe('LitPlugin staticExport', () => {
	function createStaticExportFixture() {
		const appConfig = {
			rootDir: '/app',
			srcDir: 'src',
			absolutePaths: { config: '/app/eco.config.ts' },
		} as unknown as EcoPagesAppConfig;
		const plugin = new LitPlugin();
		plugin.setConfig(appConfig);
		const context = { appConfig, baseUrl: 'http://127.0.0.1:3000' } as unknown as StaticExportContext;
		const ensureWorker = vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockResolvedValue();
		vi.spyOn(LitStaticRenderSession.prototype, 'preloadStaticRoutes').mockResolvedValue();
		const dispose = vi.spyOn(LitStaticRenderSession.prototype, 'dispose').mockResolvedValue();
		return { plugin, context, ensureWorker, dispose };
	}

	it('stops the render worker when the returned release runs', async () => {
		const { plugin, context, ensureWorker, dispose } = createStaticExportFixture();

		const release = await plugin.staticExport(context);

		expect(ensureWorker).toHaveBeenCalledWith({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});
		expect(dispose).not.toHaveBeenCalled();

		await release();

		expect(dispose).toHaveBeenCalledTimes(1);
		expect(plugin['renderSession']).toBeNull();
	});

	it('releases the session that setup started instead of starting another', async () => {
		const { plugin, context, ensureWorker, dispose } = createStaticExportFixture();
		plugin['renderSession'] = plugin['createRenderSession']();

		const release = await plugin.staticExport(context);
		await release();

		expect(ensureWorker).not.toHaveBeenCalled();
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(plugin['renderSession']).toBeNull();
	});
});
