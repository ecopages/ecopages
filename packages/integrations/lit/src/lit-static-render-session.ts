import path from 'node:path';
import type { EcoComponent, EcoPagesAppConfig } from '@ecopages/core';
import type { StaticExportContext } from '@ecopages/core/plugins/integration-plugin';
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { LitSsrLazyPreloader } from './lit-ssr-lazy-preloader.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import { LitStaticRenderWorkerClient } from './lit-static-render-worker-client.ts';

type LitStaticRenderSessionOptions = {
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	processDependencies?: (
		dependencies: AssetDefinition[],
		integrationName: string,
	) => Promise<Array<{ filepath?: string }>>;
	preferSourceImports?: boolean;
};

/**
 * Build-scoped Lit server render session.
 *
 * Preloads SSR-eligible lazy scripts and renders Lit page routes through a
 * dedicated worker thread for both static export and runtime/dev requests.
 */
export class LitStaticRenderSession {
	private readonly preloader: LitSsrLazyPreloader;
	private workerClient: LitStaticRenderWorkerClient | null = null;

	constructor(options: LitStaticRenderSessionOptions) {
		this.preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: options.resolveDependencyPath,
			processDependencies: options.processDependencies,
			preferSourceImports: options.preferSourceImports,
		});
	}

	async ensureWorker(input: { configModulePath: string; runtimeOrigin: string }): Promise<void> {
		if (this.workerClient) {
			return;
		}

		this.workerClient = new LitStaticRenderWorkerClient({
			configModulePath: input.configModulePath,
			runtimeOrigin: input.runtimeOrigin,
		});
		await this.workerClient.start();
	}

	async preloadStaticRoutes(context: StaticExportContext): Promise<void> {
		await this.preloadLitRoutes(context);
	}

	async preloadSsrLazyScripts(components: Array<EcoComponent | undefined>): Promise<void> {
		await this.preloader.preloadSsrLazyScripts(components);
	}

	collectSsrPreloadScripts(components: Array<EcoComponent | undefined>): string[] {
		return this.preloader.collectSsrPreloadScripts(components);
	}

	async renderPageInWorker(input: { filePath: string; params: Record<string, string> }): Promise<string> {
		if (!this.workerClient) {
			throw new Error('Lit static render worker is not active');
		}

		return this.workerClient.renderPage(input);
	}

	isExpectedSsrPreloadError(error: unknown): boolean {
		return this.preloader.isExpectedSsrPreloadError(error);
	}

	async dispose(): Promise<void> {
		await this.workerClient?.dispose();
		this.workerClient = null;
	}

	private async preloadLitRoutes(context: StaticExportContext): Promise<void> {
		if (!context.routeRendererFactory) {
			return;
		}

		const routes = await context.router.listStaticGenerationRoutes({ runtimeOrigin: context.baseUrl });
		const components: Array<EcoComponent | undefined> = [];

		for (const route of routes) {
			const filePath = route.templateRoute.filePath;
			if (!this.isLitRoute(filePath, context.appConfig)) {
				continue;
			}

			const pageRenderer = context.routeRendererFactory.getPageRenderer(filePath);
			const pageModule = await pageRenderer.loadPageModule(filePath);
			const page = pageModule.default;
			if (page) {
				components.push(page);
				if (page.config?.layout) {
					components.push(page.config.layout);
				}
				for (const nestedComponent of page.config?.dependencies?.components ?? []) {
					components.push(nestedComponent);
				}
			}
		}

		await this.preloadSsrLazyScripts(components);
	}

	private isLitRoute(filePath: string, appConfig: EcoPagesAppConfig): boolean {
		const litIntegration = appConfig.integrations.find((plugin) => plugin.name === LIT_PLUGIN_NAME);
		if (!litIntegration) {
			return false;
		}

		const normalizedPath = path.normalize(filePath);
		return litIntegration.extensions.some((extension) => normalizedPath.endsWith(extension));
	}
}
