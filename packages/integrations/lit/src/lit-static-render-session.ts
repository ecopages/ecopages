import path from 'node:path';
import type { EcoComponent, EcoPagesAppConfig, PageParams, PageQuery } from '@ecopages/core';
import type { StaticExportContext } from '@ecopages/core/plugins/integration-plugin';
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { LitSsrLazyPreloader, type LitSsrLazyPreloaderOptions } from './lit-ssr-lazy-preloader.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import { LitStaticRenderWorkerClient } from './lit-static-render-worker-client.ts';
import type { LitStaticRenderCacheStrategy } from './lit-static-render-protocol.ts';

type LitStaticRenderWorkerClientContract = Pick<LitStaticRenderWorkerClient, 'start' | 'renderPage' | 'dispose'>;

type LitStaticRenderWorkerIdentity = {
	configModulePath: string;
	runtimeOrigin: string;
};

type LitStaticRenderSessionOptions = {
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	processDependencies?: (
		dependencies: AssetDefinition[],
		integrationName: string,
	) => Promise<Array<{ filepath?: string }>>;
	preferSourceImports?: boolean;
	importServerModule?: LitSsrLazyPreloaderOptions['importServerModule'];
	getInvalidationVersion?: () => number;
	createWorkerClient?: (input: {
		configModulePath: string;
		runtimeOrigin: string;
	}) => LitStaticRenderWorkerClientContract;
};

/**
 * Plugin-runtime-scoped Lit server render session.
 *
 * @remarks
 * Owns worker lifecycle and SSR preload for Lit page routes during static export
 * and runtime/dev requests. Injected into `LitRenderer` via a lazy accessor from
 * `LitPlugin`; there is no process-global coordinator.
 *
 * Worker init identity is sticky for the first `{ configModulePath, runtimeOrigin }`.
 * Later `ensureWorker` calls with the same identity are no-ops; a different identity
 * recreates the worker so stale config/origin is never silently reused.
 */
export class LitStaticRenderSession {
	private readonly preloader: LitSsrLazyPreloader;
	private readonly createWorkerClient: NonNullable<LitStaticRenderSessionOptions['createWorkerClient']>;
	private workerClient: LitStaticRenderWorkerClientContract | null = null;
	private workerIdentity: LitStaticRenderWorkerIdentity | null = null;
	private readonly getInvalidationVersion: () => number;
	private workerInvalidationVersion = 0;
	private renderChain: Promise<void> = Promise.resolve();

	constructor(options: LitStaticRenderSessionOptions) {
		this.getInvalidationVersion = options.getInvalidationVersion ?? (() => 0);
		this.preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: options.resolveDependencyPath,
			processDependencies: options.processDependencies,
			preferSourceImports: options.preferSourceImports,
			importServerModule: options.importServerModule,
		});
		this.createWorkerClient =
			options.createWorkerClient ??
			((input) =>
				new LitStaticRenderWorkerClient({
					configModulePath: input.configModulePath,
					runtimeOrigin: input.runtimeOrigin,
				}));
	}

	/**
	 * Ensures the static render worker is running for the given identity.
	 *
	 * @remarks
	 * First successful start sticks that identity. Matching re-entry is a no-op.
	 * A different `configModulePath` or `runtimeOrigin` disposes and recreates.
	 */
	async ensureWorker(input: { configModulePath: string; runtimeOrigin: string }): Promise<void> {
		if (
			this.workerClient &&
			this.workerIdentity &&
			this.workerIdentity.configModulePath === input.configModulePath &&
			this.workerIdentity.runtimeOrigin === input.runtimeOrigin
		) {
			return;
		}

		if (this.workerClient) {
			await this.dispose();
		}

		this.workerIdentity = {
			configModulePath: input.configModulePath,
			runtimeOrigin: input.runtimeOrigin,
		};
		this.workerClient = this.createWorkerClient({
			configModulePath: input.configModulePath,
			runtimeOrigin: input.runtimeOrigin,
		});
		await this.workerClient.start();
		this.workerInvalidationVersion = this.getInvalidationVersion();
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

	async renderPageInWorker(input: {
		filePath: string;
		params: PageParams;
		query?: PageQuery;
	}): Promise<{ html: string; cacheStrategy?: LitStaticRenderCacheStrategy }> {
		if (!this.workerClient) {
			throw new Error('Lit static render worker is not active');
		}

		const render = this.renderChain.then(async () => {
			const version = this.getInvalidationVersion();
			if (version !== this.workerInvalidationVersion && this.workerIdentity) {
				const identity = this.workerIdentity;
				await this.dispose();
				await this.ensureWorker(identity);
			}
			if (!this.workerClient) throw new Error('Lit static render worker is not active');
			return this.workerClient.renderPage(input);
		});
		this.renderChain = render.then(() => undefined, () => undefined);
		return render;
	}

	isExpectedSsrPreloadError(error: unknown): boolean {
		return this.preloader.isExpectedSsrPreloadError(error);
	}

	async dispose(): Promise<void> {
		await this.workerClient?.dispose();
		this.workerClient = null;
		this.workerIdentity = null;
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
				for (const layout of page.config?.layouts ?? []) {
					components.push(layout);
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
