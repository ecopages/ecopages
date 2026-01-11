import { StaticContentServer } from '../../dev/sc-server';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
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
}

/**
 * Handles static site generation and previews.
 */
export class ServerStaticBuilder {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly staticSiteGenerator: StaticSiteGenerator;
	private readonly serveOptions: ServeOptions;

	constructor({ appConfig, staticSiteGenerator, serveOptions }: ServerStaticBuilderParams) {
		this.appConfig = appConfig;
		this.staticSiteGenerator = staticSiteGenerator;
		this.serveOptions = serveOptions;
	}

	/**
	 * Generates a static build of the site for deployment.
	 * @param options.preview - If true, starts a preview server after build
	 * @param dependencies.router - The initialized router
	 * @param dependencies.routeRendererFactory - The route renderer factory
	 */
	async build(
		options: StaticBuildOptions | undefined,
		dependencies: {
			router: FSRouter;
			routeRendererFactory: RouteRendererFactory;
		},
	): Promise<void> {
		const { preview = false } = options ?? {};

		const baseUrl = `http://${this.serveOptions.hostname || 'localhost'}:${this.serveOptions.port || 3000}`;

		await this.staticSiteGenerator.run({
			router: dependencies.router,
			baseUrl,
			routeRendererFactory: dependencies.routeRendererFactory,
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
