import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '@ecopages/core/create-app';
import { requireAppRuntime } from '@ecopages/core/integration';
import type { AppRuntime } from '@ecopages/core/integration';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import type { StaticExportContext } from '@ecopages/core/integration';
import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	CustomElementScriptPreloader,
	type CustomElementScriptPreloadScopeState,
} from '@ecopages/core/integration';
import { AssetProcessingService } from '@ecopages/core/integration';
import { ensureLitDomShim } from '../dom-shim.ts';
import { LitPlugin } from '../lit.plugin.ts';
import { LitRenderer } from '../lit-renderer.ts';
import { LitStaticRenderSession } from '../lit-static-render-session.ts';

const preloadInvalidationSpy = vi.hoisted(() => vi.fn());

vi.mock('@ecopages/core/integration', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@ecopages/core/integration')>();
	return {
		...actual,
		invalidateCustomElementScriptPreload: (
			preloadScopes: Map<string, CustomElementScriptPreloadScopeState>,
			scriptPath: string,
			cacheScope?: string,
		) => {
			preloadInvalidationSpy(preloadScopes, scriptPath, cacheScope);
			return actual.invalidateCustomElementScriptPreload(preloadScopes, scriptPath, cacheScope);
		},
	};
});

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

	it('initializes its configured renderer class', async () => {
		class CustomLitRenderer extends LitRenderer {}

		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', srcDir: 'src' });
		appConfig.absolutePaths.config = '/app/eco.config.ts';
		const plugin = new LitPlugin();
		plugin.renderer = CustomLitRenderer;
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockResolvedValue();
		await plugin.setup({ appConfig, runtime: requireAppRuntime(appConfig) });

		const renderer = plugin.getRenderer();

		expect(renderer).toBeInstanceOf(CustomLitRenderer);
	});
});

describe('LitPlugin render session invalidation', () => {
	it('reads the invalidation version from the app module loader generation', async () => {
		let generation = 0;
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', srcDir: 'src' });
		appConfig.appRuntime!.moduleLoader = {
			importModule: async <T = unknown>() => ({}) as T,
			invalidateDevelopmentGraph: () => {
				generation += 1;
			},
			getDevelopmentGeneration: () => generation,
		} satisfies AppRuntime['moduleLoader'];

		const plugin = new LitPlugin();
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockResolvedValue();
		await plugin.setup({ appConfig, runtime: requireAppRuntime(appConfig) });
		const session = plugin['createRenderSession']();

		expect(session['getInvalidationVersion']()).toBe(0);

		appConfig.appRuntime!.moduleLoader.invalidateDevelopmentGraph();

		expect(session['getInvalidationVersion']()).toBe(1);
	});
});

describe('LitPlugin staticExport', () => {
	async function createStaticExportFixture(runtimeOrigin = 'http://127.0.0.1:3000') {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', srcDir: 'src' });
		appConfig.absolutePaths.config = '/app/eco.config.ts';
		const plugin = new LitPlugin();
		const context = { appConfig, baseUrl: 'http://127.0.0.1:3000' } as unknown as StaticExportContext;
		const ensureWorker = vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockResolvedValue();
		vi.spyOn(LitStaticRenderSession.prototype, 'preloadStaticRoutes').mockResolvedValue();
		const dispose = vi.spyOn(LitStaticRenderSession.prototype, 'dispose').mockResolvedValue();
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		requireAppRuntime(appConfig).origin = runtimeOrigin;
		await plugin.setup({ appConfig, runtime: requireAppRuntime(appConfig) });
		return { plugin, context, ensureWorker, dispose };
	}

	it('stops the render worker when the returned release runs', async () => {
		const { plugin, context, ensureWorker, dispose } = await createStaticExportFixture();

		const release = await plugin.staticExport(context);

		expect(ensureWorker).toHaveBeenCalledTimes(2);
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
		const { plugin, context, ensureWorker, dispose } = await createStaticExportFixture();
		const release = await plugin.staticExport(context);
		await release();

		expect(ensureWorker).toHaveBeenCalledTimes(2);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(plugin['renderSession']).toBeNull();
	});

	it('keeps one session across setup and static export', async () => {
		const { plugin, context, ensureWorker, dispose } = await createStaticExportFixture();
		const exportSession = plugin['renderSession'];

		const release = await plugin.staticExport(context);

		expect(plugin['renderSession']).toBe(exportSession);
		expect(ensureWorker).toHaveBeenCalledTimes(2);

		await release();

		expect(dispose).toHaveBeenCalledTimes(1);
		expect(plugin['renderSession']).toBeNull();
	});

	it('reconciles the worker origin with the static export base URL', async () => {
		const setupOrigin = 'http://127.0.0.1:4000';
		const { plugin, context, ensureWorker } = await createStaticExportFixture(setupOrigin);

		const release = await plugin.staticExport(context);

		expect(ensureWorker).toHaveBeenCalledTimes(2);
		expect(ensureWorker).toHaveBeenNthCalledWith(1, {
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: setupOrigin,
		});
		expect(ensureWorker).toHaveBeenNthCalledWith(2, {
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: context.baseUrl,
		});

		await release();
	});
});

describe('LitPlugin watch restart script-change invalidation', () => {
	it('runs the Lit SSR preload invalidation once after an app in watch mode is stopped and started again', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-lit-watch-restart-'));
		const srcDir = path.join(rootDir, 'src');
		const pagesDir = path.join(srcDir, 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		const scriptPath = path.join(srcDir, 'counter.script.ts');
		const componentFile = path.join(srcDir, 'counter.lit.tsx');
		fs.writeFileSync(scriptPath, "console.log('counter v1');\n", 'utf8');

		const previousArgv = [...process.argv];
		process.argv = [...previousArgv.filter((arg) => arg !== '--build' && arg !== '--preview'), '--dev'];

		vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockResolvedValue();
		vi.spyOn(LitStaticRenderSession.prototype, 'dispose').mockResolvedValue();
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);

		const plugin = new LitPlugin();

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			srcDir: 'src',
			integrations: [plugin],
		});
		appConfig.absolutePaths.config = path.join(rootDir, 'eco.config.ts');

		const importServerModule = vi.fn(async () => ({}));
		const preloader = new CustomElementScriptPreloader({
			cacheScope: CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.lit,
			preloadScopes: requireAppRuntime(appConfig).customElementSsrPreloadScopes,
			logLabel: 'lit',
			requireLazyScriptEntry: true,
			resolveDependencyPath: (componentDir, sourcePath) => path.join(componentDir, sourcePath),
			importServerModule,
		});
		const component = Object.assign(() => null, {
			config: {
				identity: {
					id: 'counter',
					file: componentFile,
					integration: 'lit',
				},
				dependencies: {
					scripts: [
						{
							src: './counter.script.ts',
							ssr: true,
							lazy: { 'on:interaction': 'mouseenter' },
						},
					],
				},
			},
		});

		const app = await createApp({
			appConfig,
			serverOptions: { hostname: '127.0.0.1', port: 0 },
		});

		try {
			await app.start();
			const firstHmr = requireAppRuntime(appConfig).hmr;
			expect(firstHmr).not.toBeNull();
			await firstHmr!.registerScriptEntrypoint(scriptPath);

			await app.stop();
			expect(requireAppRuntime(appConfig).hmr).toBeNull();

			await app.start();
			const secondHmr = requireAppRuntime(appConfig).hmr;
			expect(secondHmr).not.toBeNull();
			expect(secondHmr).not.toBe(firstHmr);
			await secondHmr!.registerScriptEntrypoint(scriptPath);

			ensureLitDomShim();
			await preloader.preloadSsrScripts([component]);
			await preloader.preloadSsrScripts([component]);
			expect(importServerModule).toHaveBeenCalledTimes(1);

			preloadInvalidationSpy.mockClear();
			fs.writeFileSync(scriptPath, "console.log('counter v2');\n", 'utf8');
			await secondHmr!.handleFileChange(scriptPath);

			expect(preloadInvalidationSpy).toHaveBeenCalledTimes(1);
			expect(preloadInvalidationSpy).toHaveBeenCalledWith(
				requireAppRuntime(appConfig).customElementSsrPreloadScopes,
				scriptPath,
				CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.lit,
			);

			await preloader.preloadSsrScripts([component]);
			expect(importServerModule).toHaveBeenCalledTimes(2);
		} finally {
			await app.stop();
			process.argv = previousArgv;
			vi.restoreAllMocks();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
