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
import { path } from '@ecopages/file-system/path';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/integration';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import { ensureLitDomShim } from './dom-shim.ts';
import { createLitRenderer, LitRenderer } from './lit-renderer.ts';
import { LitStaticRenderSession } from './lit-static-render-session.ts';

/**
 * The name of the Lit plugin
 */
export const PLUGIN_NAME = LIT_PLUGIN_NAME;

const litHydrateSupportPath = path.fromFileUrl(import.meta.resolve('@ecopages/lit/hydrate-support'));

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
	/**
	 * @remarks
	 * Lit is the custom-element server renderer, so it also evaluates the `ssr: true` scripts of Components whose
	 * Integration has no preloader, such as a Lit element declared on a Kita Component.
	 */
	override readonly ssrScriptPreload = 'own-and-foreign' as const;
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
	 * Lit's SSR hydration support is a module script of the app's browser graph, so it shares the `lit` module the
	 * app's elements load instead of carrying its own copy. It is placed first in the head, before any custom element is defined.
	 */
	getDependencies(): AssetDefinition[] {
		return [
			AssetFactory.createFileScript({
				position: 'head',
				filepath: litHydrateSupportPath,
				attributes: {
					type: 'module',
					'data-eco-script-id': 'lit-hydrate-support',
				},
			}),
		];
	}

	private createRenderSession(): LitStaticRenderSession {
		return new LitStaticRenderSession({
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
	 * Starts the render worker for this export and returns a release that stops it.
	 *
	 * @remarks
	 * Serving never starts this session. Static export owns the worker for the duration of the export and
	 * releases it afterwards, so an in-process export leaves no worker thread running.
	 *
	 * The session is published only once its worker has started: the export boots while the browser graph
	 * prebuild runs, and a render that saw a half-started session would fail instead of rendering in-process.
	 */
	override async staticExport(context: StaticExportContext): Promise<StaticExportRelease> {
		const configModulePath = context.appConfig.absolutePaths.config;
		if (!configModulePath) {
			throw new Error('[ecopages][lit] Lit static export requires appConfig.absolutePaths.config');
		}

		const session = this.createRenderSession();
		try {
			await session.ensureWorker({
				configModulePath,
				runtimeOrigin: context.baseUrl,
				directories: {
					distDir: path.resolve(context.appConfig.rootDir, context.appConfig.distDir),
					workDir: context.appConfig.absolutePaths.workDir,
				},
			});
		} catch (error) {
			await session.dispose();
			throw error;
		}
		this.renderSession = session;

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
