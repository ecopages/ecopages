import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	invalidateCustomElementScriptPreload,
} from '@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-script-preloader';
import type { IHmrManager } from '@ecopages/core';
/**
 * This module contains the Lit plugin
 * @module
 */

import './console.ts';
import {
	IntegrationPlugin,
	type IntegrationPluginConfig,
	type StaticExportContext,
	type StaticExportRelease,
} from '@ecopages/core/plugins/integration-plugin';
import { isLitStaticRenderWorkerThread } from '@ecopages/core/build/lit-static-render-worker-context';
import path from 'node:path';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import { litElementHydrateScript } from './lit-element-hydrate.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import { createLitRenderer, LitRenderer } from './lit-renderer.ts';
import { LitStaticRenderSession } from './lit-static-render-session.ts';

/**
 * The name of the Lit plugin
 */
export const PLUGIN_NAME = LIT_PLUGIN_NAME;

/**
 * The Lit plugin class
 * This plugin provides support for Lit components in Ecopages
 *
 * @remarks
 * Owns the {@link LitStaticRenderSession} for worker SSR. Renderers receive a
 * lazy `getRenderSession` accessor so construction before {@link setup} still
 * observes the session once setup assigns it.
 */
export class LitPlugin extends IntegrationPlugin {
	renderer = LitRenderer;
	private renderSession: LitStaticRenderSession | null = null;

	constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.lit.tsx'],
			...options,
		});

		this.integrationDependencies.unshift(...this.getDependencies());
	}

	/**
	 * Returns the global integration dependencies required in the browser.
	 *
	 * @remarks
	 * Injects Lit's hydration support script into the document head before any
	 * custom element connects. While `@lit-labs/ssr-client/lit-element-hydrate-support.js`
	 * can be resolved directly in modern Bun and Node environments, an inline self-contained
	 * script is currently emitted to ensure synchronous availability before custom-element
	 * registration without requiring an import map for `@lit-labs/ssr-client` subpath imports.
	 */
	getDependencies(): AssetDefinition[] {
		return [
			AssetFactory.createInlineContentScript({
				position: 'head',
				content: `(() => {${litElementHydrateScript}})();`,
				bundle: false,
				attributes: {
					'data-eco-script-id': 'lit-hydrate-support',
				},
			}),
		];
	}

	private createRenderSession(): LitStaticRenderSession {
		if (!this.appConfig || !this.assetProcessingService) {
			throw new Error('Lit plugin must be initialized before starting the render worker');
		}

		return new LitStaticRenderSession({
			resolveDependencyPath: (componentDir, sourcePath) => path.join(componentDir, sourcePath),
			processDependencies: this.assetProcessingService.processDependencies.bind(this.assetProcessingService),
			getInvalidationVersion: () => this.appConfig?.runtime?.appModuleLoader?.getDevelopmentGeneration() ?? 0,
		});
	}

	override initializeRenderer(): LitRenderer {
		const Renderer =
			this.renderer === LitRenderer ? createLitRenderer(() => this.renderSession ?? undefined) : this.renderer;
		const renderer = new Renderer(this.createRendererOptions());
		return this.attachRendererRuntimeServices(renderer);
	}

	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);

		if (!this.appConfig) {
			return;
		}

		const runtime = this.appConfig.runtime ?? {};
		this.appConfig.runtime = runtime;
		runtime.registeredScriptEntrypointChangeHandlers ??= [];
		runtime.registeredScriptEntrypointChangeHandlers.push((scriptPath) => {
			invalidateCustomElementScriptPreload(scriptPath, CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.lit);
		});
	}

	override async setup(): Promise<void> {
		await super.setup();

		if (!this.appConfig?.absolutePaths?.config) {
			throw new Error('[ecopages][lit] Lit server rendering requires appConfig.absolutePaths.config');
		}

		if (isLitStaticRenderWorkerThread()) {
			return;
		}

		this.renderSession ??= this.createRenderSession();
		await this.renderSession.ensureWorker({
			configModulePath: this.appConfig.absolutePaths.config,
			runtimeOrigin: this.runtimeOrigin,
		});
	}

	override async teardown(): Promise<void> {
		await this.renderSession?.dispose();
		this.renderSession = null;
		await super.teardown();
	}

	/**
	 * Starts the render worker if `setup()` has not and preloads the Lit routes.
	 *
	 * @remarks
	 * `ecopages build` defers Integration setup until the first page renders, so `staticExport()` normally
	 * creates the session and the later `setup()` reuses it, with its preloaded routes, instead of starting a
	 * second one. The worker restarts only if the two origins differ. The returned release stops the worker once the export ends, so an in-process
	 * export leaves no worker thread running. A later render in the same process falls back to rendering
	 * in-process.
	 */
	override async staticExport(context: StaticExportContext): Promise<StaticExportRelease> {
		if (!this.renderSession) {
			this.renderSession = this.createRenderSession();
			await this.renderSession.ensureWorker({
				configModulePath: context.appConfig.absolutePaths.config,
				runtimeOrigin: context.baseUrl,
			});
		}

		const session = this.renderSession;
		await session.preloadStaticRoutes(context);

		return async () => {
			await session.dispose();
			if (this.renderSession === session) {
				this.renderSession = null;
			}
		};
	}
}

/**
 * Factory function to create a Lit plugin instance
 * @param options Configuration options for the Lit plugin
 * @returns A new LitPlugin instance
 */
export function litPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): LitPlugin {
	return new LitPlugin(options);
}
