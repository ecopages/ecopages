import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	invalidateCustomElementScriptPreload,
} from '@ecopages/core/integration';
/**
 * This module contains the Lit plugin
 * @module
 */

import {
	IntegrationPlugin,
	type IntegrationRendererBase,
	type IntegrationRuntimeContext,
	type IntegrationPluginConfig,
	type StaticExportContext,
	type StaticExportRelease,
} from '@ecopages/core/integration';
import path from 'node:path';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/integration';
import { litElementHydrateScript } from './lit-element-hydrate.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import { ensureLitDomShim } from './dom-shim.ts';
import { createLitRenderer, LitRenderer } from './lit-renderer.ts';
import { LitStaticRenderSession } from './lit-static-render-session.ts';

/**
 * The name of the Lit plugin
 */
export const PLUGIN_NAME = LIT_PLUGIN_NAME;

/**
 * @remarks
 * Owns the {@link LitStaticRenderSession} for static-export worker SSR. Serving
 * leaves the session unset so every Lit Page renders in-process. Renderers
 * receive a lazy `getRenderSession` accessor so construction before
 * {@link staticExport} still observes the session once export assigns it.
 */
export class LitPlugin extends IntegrationPlugin {
	renderer = LitRenderer;
	override readonly serverDom = {
		kind: 'repair' as const,
		install(): void {
			ensureLitDomShim();
		},
	};
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
		if (!this.appConfig || !this.runtime || !this.assetProcessingService) {
			throw new Error('Lit plugin must be initialized before starting the render worker');
		}
		const assetProcessingService = this.assetProcessingService;

		return new LitStaticRenderSession({
			preloadScopes: this.runtime.customElementSsrPreloadScopes,
			integration: this,
			resolveDependencyPath: (componentDir, sourcePath) => path.join(componentDir, sourcePath),
			processDependencies: (dependencies, integration) =>
				assetProcessingService.processDependencies(dependencies, integration),
			getInvalidationVersion: () => this.runtime?.moduleLoader.getDevelopmentGeneration() ?? 0,
		});
	}

	override createRenderer(base: IntegrationRendererBase): LitRenderer {
		const Renderer =
			this.renderer === LitRenderer ? createLitRenderer(() => this.renderSession ?? undefined) : this.renderer;
		const renderer = new Renderer(base);
		renderer.name ||= this.name;
		return renderer;
	}

	override hmr(context: IntegrationRuntimeContext): void {
		super.hmr(context);
		const manager = context.runtime.hmr;
		if (!manager) return;
		const preloadScopes = context.runtime.customElementSsrPreloadScopes;
		manager.onScriptEntrypointChanged?.((scriptPath) => {
			invalidateCustomElementScriptPreload(
				preloadScopes,
				scriptPath,
				CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.lit,
			);
		});
	}

	override async teardown(): Promise<void> {
		await this.renderSession?.dispose();
		this.renderSession = null;
		await super.teardown();
	}

	/**
	 * Starts the render worker for this export, preloads Lit routes, and returns a release that stops it.
	 *
	 * @remarks
	 * Serving never starts this session. Static export owns the worker for the duration of the export and
	 * releases it afterwards, so an in-process export leaves no worker thread running.
	 */
	override async staticExport(context: StaticExportContext): Promise<StaticExportRelease> {
		const configModulePath = context.appConfig.absolutePaths.config;
		if (!configModulePath) {
			throw new Error('[ecopages][lit] Lit static export requires appConfig.absolutePaths.config');
		}

		this.renderSession = this.createRenderSession();
		await this.renderSession.ensureWorker({
			configModulePath,
			runtimeOrigin: context.baseUrl,
		});

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
