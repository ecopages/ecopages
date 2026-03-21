import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { StaticContentServer } from '../../dev/sc-server';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { ApiHandler, StaticRoute } from '../../public-types';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer';
import type { FSRouter } from '../../router/fs-router';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator';

export interface StaticBuildOptions {
	preview?: boolean;
}

export interface ServeOptions {
	hostname?: string;
	port?: number | string;
}

export interface ServerStaticBuilderParams {
	appConfig: EcoPagesAppConfig;
	staticSiteGenerator: StaticSiteGenerator;
	serveOptions: ServeOptions;
	apiHandlers?: ApiHandler[];
}

/**
 * Handles static site generation and previews.
 */
export class ServerStaticBuilder {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly staticSiteGenerator: StaticSiteGenerator;
	private readonly serveOptions: ServeOptions;
	private readonly apiHandlers: ApiHandler[];

	constructor({ appConfig, staticSiteGenerator, serveOptions, apiHandlers }: ServerStaticBuilderParams) {
		this.appConfig = appConfig;
		this.staticSiteGenerator = staticSiteGenerator;
		this.serveOptions = serveOptions;
		this.apiHandlers = apiHandlers ?? [];
	}

	private warnApiHandlersUnavailableInStaticMode(): void {
		if (this.apiHandlers.length === 0) {
			return;
		}

		const uniqueHandlers = Array.from(
			new Set(this.apiHandlers.map((handler) => `${handler.method} ${handler.path}`)),
		);
		const visibleHandlers = uniqueHandlers.slice(0, 5).join(', ');
		const remainingCount = uniqueHandlers.length - Math.min(uniqueHandlers.length, 5);
		const summary = remainingCount > 0 ? `${visibleHandlers}, +${remainingCount} more` : visibleHandlers;

		appLogger.warn(
			'Registered API endpoints are not available in static build or preview modes because no server runtime is started. They are excluded from the generated output.\n',
			`➤ ${summary}`,
		);
	}

	private prepareExportDirectory(): void {
		const exportDir =
			this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, this.appConfig.distDir);
		fileSystem.ensureDir(exportDir, true);

		const srcPublicDir = path.join(
			this.appConfig.rootDir,
			this.appConfig.srcDir ?? 'src',
			this.appConfig.publicDir ?? 'public',
		);
		if (fileSystem.exists(srcPublicDir)) {
			fileSystem.copyDir(srcPublicDir, exportDir);
		}
	}

	private async refreshRuntimeAssets(): Promise<void> {
		for (const processor of this.appConfig.processors.values()) {
			await processor.setup();
		}

		for (const integration of this.appConfig.integrations) {
			await integration.setup();
		}
	}

	/**
	 * Generates a static build of the site for deployment.
	 * @param options.preview - If true, starts a preview server after build
	 * @param dependencies.router - The initialized router
	 * @param dependencies.routeRendererFactory - The route renderer factory
	 * @param dependencies.staticRoutes - Explicit static routes registered via app.static()
	 */
	async build(
		options: StaticBuildOptions | undefined,
		dependencies: {
			router: FSRouter;
			routeRendererFactory: RouteRendererFactory;
			staticRoutes?: StaticRoute[];
		},
	): Promise<void> {
		const { preview = false } = options ?? {};

		const baseUrl = `http://${this.serveOptions.hostname || 'localhost'}:${this.serveOptions.port || 3000}`;
		this.warnApiHandlersUnavailableInStaticMode();
		this.prepareExportDirectory();
		await this.refreshRuntimeAssets();

		await this.staticSiteGenerator.run({
			router: dependencies.router,
			baseUrl,
			routeRendererFactory: dependencies.routeRendererFactory,
			staticRoutes: dependencies.staticRoutes,
		});

		if (!preview) {
			appLogger.info('Build completed');
			return;
		}

		const previewPort = this.serveOptions.port || 3000;

		const { server } = StaticContentServer.createServer({
			appConfig: this.appConfig,
			options: { port: Number(previewPort) },
		});

		if (server) {
			appLogger.info(`Preview running at http://localhost:${server.port}`);
		} else {
			appLogger.error('Failed to start preview server');
		}
	}
}
