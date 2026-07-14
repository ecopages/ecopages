/**
 * This module contains the Lit plugin
 * @module
 */

import './console.ts';
import {
	IntegrationPlugin,
	type IntegrationPluginConfig,
	type StaticExportContext,
} from '@ecopages/core/plugins/integration-plugin';
import { isLitStaticRenderWorkerThread } from '@ecopages/core/build/lit-static-render-worker-context';
import path from 'node:path';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import { litElementHydrateScript } from './lit-element-hydrate.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import { LitRenderer } from './lit-renderer.ts';
import { setActiveLitStaticRenderSession } from './lit-static-render-coordinator.ts';
import { LitStaticRenderSession } from './lit-static-render-session.ts';

/**
 * The name of the Lit plugin
 */
export const PLUGIN_NAME = LIT_PLUGIN_NAME;

/**
 * The Lit plugin class
 * This plugin provides support for Lit components in Ecopages
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

	getDependencies(): AssetDefinition[] {
		return [
			/**
			 * BUG ALERT
			 * Due to an issue appeared in Bun 1.2.2, we need to use a workaround to import the hydrate script.
			 * This is a temporary solution until the issue is resolved.
			 * The litElementHydrateScript is the same file built on Bun 1.1.45.
			 * https://github.com/oven-sh/bun/issues/17180
			 *
			 * AssetFactory.createNodeModuleScript({
			 *    position: 'head',
			 *    importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js'
			 * })
			 */
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
			preferSourceImports: typeof Bun !== 'undefined',
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

		this.renderSession = this.createRenderSession();
		await this.renderSession.ensureWorker({
			configModulePath: this.appConfig.absolutePaths.config,
			runtimeOrigin: this.runtimeOrigin,
		});
		setActiveLitStaticRenderSession(this.renderSession);
	}

	override async teardown(): Promise<void> {
		await this.renderSession?.dispose();
		this.renderSession = null;
		setActiveLitStaticRenderSession(null);
		await super.teardown();
	}

	override async beforeStaticExport(context: StaticExportContext): Promise<void> {
		if (!this.renderSession) {
			this.renderSession = this.createRenderSession();
			await this.renderSession.ensureWorker({
				configModulePath: context.appConfig.absolutePaths.config,
				runtimeOrigin: context.baseUrl,
			});
			setActiveLitStaticRenderSession(this.renderSession);
		}

		await this.renderSession.preloadStaticRoutes(context);
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
