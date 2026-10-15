import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '@ecopages/core/create-app';
import { requireAppRuntime } from '@ecopages/core/config/app-runtime';
import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';
import type { StaticExportContext } from '@ecopages/core/plugins/integration-plugin';
import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	CustomElementScriptPreloader,
} from '@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-script-preloader';
import { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import { ensureLitDomShim } from '../dom-shim.ts';
import { LitPlugin } from '../lit.plugin.ts';
import { LitRenderer } from '../lit-renderer.ts';
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

	it('initializes its configured renderer class', async () => {
		class CustomLitRenderer extends LitRenderer {}

		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', srcDir: 'src' });
		appConfig.absolutePaths.config = '/app/eco.config.ts';
		const plugin = new LitPlugin();
		plugin.renderer = CustomLitRenderer;
		plugin.setConfig(appConfig);

		const renderer = plugin.initializeRenderer();

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
		};

		const plugin = new LitPlugin();
		plugin.setConfig(appConfig);
		const session = plugin['createRenderSession']();

		expect(session['getInvalidationVersion']()).toBe(0);

		appConfig.appRuntime!.moduleLoader.invalidateDevelopmentGraph();

		expect(session['getInvalidationVersion']()).toBe(1);
	});
});

describe('LitPlugin staticExport', () => {
	async function createStaticExportFixture() {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/app', srcDir: 'src' });
		appConfig.absolutePaths.config = '/app/eco.config.ts';
		const plugin = new LitPlugin();
		plugin.setConfig(appConfig);
		const context = { appConfig, baseUrl: 'http://127.0.0.1:3000' } as unknown as StaticExportContext;
		const ensureWorker = vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockResolvedValue();
		vi.spyOn(LitStaticRenderSession.prototype, 'preloadStaticRoutes').mockResolvedValue();
		const dispose = vi.spyOn(LitStaticRenderSession.prototype, 'dispose').mockResolvedValue();
		return { plugin, context, ensureWorker, dispose };
	}

	it('stops the render worker when the returned release runs', async () => {
		const { plugin, context, ensureWorker, dispose } = await createStaticExportFixture();

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
		const { plugin, context, ensureWorker, dispose } = await createStaticExportFixture();
		plugin['renderSession'] = plugin['createRenderSession']();

		const release = await plugin.staticExport(context);
		await release();

		expect(ensureWorker).not.toHaveBeenCalled();
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(plugin['renderSession']).toBeNull();
	});

	it('keeps one session when setup runs after staticExport, as in ecopages build', async () => {
		const { plugin, context, dispose } = await createStaticExportFixture();
		const sessions = new Set<unknown>();
		vi.spyOn(LitStaticRenderSession.prototype, 'ensureWorker').mockImplementation(async function (this: unknown) {
			sessions.add(this);
		});
		vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([]);
		context.appConfig.appRuntime!.origin = 'http://127.0.0.1:3000';

		const release = await plugin.staticExport(context);
		const exportSession = plugin['renderSession'];
		await plugin.setup();

		expect(plugin['renderSession']).toBe(exportSession);
		expect(sessions.size).toBe(1);

		await release();

		expect(dispose).toHaveBeenCalledTimes(1);
		expect(plugin['renderSession']).toBeNull();
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
		const originalInvalidate = plugin['handleScriptEntrypointChanged'];
		const invalidationSpy = vi.fn((changedScriptPath: string) => {
			originalInvalidate(changedScriptPath);
		});
		plugin['handleScriptEntrypointChanged'] = invalidationSpy;

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			srcDir: 'src',
			integrations: [plugin],
		});
		appConfig.absolutePaths.config = path.join(rootDir, 'eco.config.ts');

		const importServerModule = vi.fn(async () => ({}));
		const preloader = new CustomElementScriptPreloader({
			cacheScope: CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.lit,
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

			invalidationSpy.mockClear();
			fs.writeFileSync(scriptPath, "console.log('counter v2');\n", 'utf8');
			await secondHmr!.handleFileChange(scriptPath);

			expect(invalidationSpy).toHaveBeenCalledTimes(1);
			expect(invalidationSpy).toHaveBeenCalledWith(scriptPath);

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
