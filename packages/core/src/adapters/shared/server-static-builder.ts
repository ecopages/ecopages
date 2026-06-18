import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { StaticContentServer } from '../../dev/sc-server.ts';
import { appLogger } from '../../global/app-logger.ts';
import { getAppBuildAdapter } from '../../build/build-adapter.ts';
import { resolveEntryFile, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../../utils/resolve-entry-file.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { ApiHandler, StaticRoute } from '../../types/public-types.ts';
import type { RouteRegistry } from '../../router/server/route-registry.ts';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import type { StaticGenerationRendererResolver } from '../../route-renderer/route-renderer.ts';

export interface StaticBuildOptions {
	preview?: boolean;
	baseUrl?: string;
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
	logger?: ServerStaticBuilderLogger;
	previewServerFactory?: ServerStaticPreviewServerFactory;
	entryFile?: string;
}

/**
 * Minimal logger dependency used by the static builder.
 */
export interface ServerStaticBuilderLogger {
	warn(message: string, detail?: string): unknown;
	info(message: string): unknown;
	error(message: string): unknown;
}

/**
 * Preview server factory dependency used when static preview mode is enabled.
 */
export interface ServerStaticPreviewServerFactory {
	createServer(args: { appConfig: EcoPagesAppConfig; options: { port: number } }): {
		server?: {
			port?: number;
		} | null;
	};
}

/**
 * Handles static site generation and previews.
 */
export class ServerStaticBuilder {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly staticSiteGenerator: StaticSiteGenerator;
	private readonly serveOptions: ServeOptions;
	private readonly apiHandlers: ApiHandler[];
	private readonly logger: ServerStaticBuilderLogger;
	private readonly previewServerFactory: ServerStaticPreviewServerFactory;
	private readonly entryFile: string;

	constructor({
		appConfig,
		staticSiteGenerator,
		serveOptions,
		apiHandlers,
		logger,
		previewServerFactory,
		entryFile,
	}: ServerStaticBuilderParams) {
		this.appConfig = appConfig;
		this.staticSiteGenerator = staticSiteGenerator;
		this.serveOptions = serveOptions;
		this.apiHandlers = apiHandlers ?? [];
		this.logger = logger ?? appLogger;
		this.previewServerFactory = previewServerFactory ?? StaticContentServer;
		this.entryFile = resolveEntryFile({ entryFile });
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
	 * Bundles the server entry file for production use.
	 *
	 * @remarks
	 * When the project has API endpoints, the entry file must be bundled
	 * into a single JS file so the production server can start without
	 * on-the-fly TypeScript transpilation. The bundle is output to
	 * `dist/{SERVER_BUNDLE_DIR}/{SERVER_BUNDLE_FILENAME}` and used by
	 * `ecopages start` in production.
	 *
	 * Package imports remain external so native addons and runtime-owned
	 * dependencies continue to load through the app's installed
	 * `node_modules` tree. Only the app entry graph is bundled.
	 *
	 * Skips silently when no API endpoints are registered (static-only site).
	 * Throws if the build adapter is unavailable, is owned by a host
	 * runtime, or bundling fails.
	 *
	 * @throws If the build adapter is unavailable, is host-owned, or bundling fails.
	 */
	private async bundleServerEntry(): Promise<void> {
		if (this.apiHandlers.length === 0) {
			return;
		}

		const buildAdapter = getAppBuildAdapter(this.appConfig);
		if (buildAdapter.ownership === 'vite-host') {
			throw new Error(
				'Cannot bundle the server entry file: build ownership is "vite-host". ' +
					'The host runtime is expected to produce its own server bundle.',
			);
		}

		const entryPath = path.isAbsolute(this.entryFile)
			? this.entryFile
			: path.join(this.appConfig.rootDir, this.entryFile);

		if (!fileSystem.exists(entryPath)) {
			throw new Error(
				`Cannot bundle server entry: file "${this.entryFile}" not found in "${this.appConfig.rootDir}".`,
			);
		}

		const distDir =
			this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, this.appConfig.distDir);
		const serverOutdir = path.join(distDir, SERVER_BUNDLE_DIR);

		this.logger.info('Bundling server entry file...');

		const result = await buildAdapter.build({
			entrypoints: [entryPath],
			outdir: serverOutdir,
			naming: SERVER_BUNDLE_FILENAME,
			target: 'node',
			format: 'esm',
			sourcemap: 'hidden',
			externalPackages: true,
			root: this.appConfig.rootDir,
		});

		if (!result.success) {
			const errorMessages = result.logs.map((log) => log.message).join('\n');
			throw new Error(`Failed to bundle server entry file:\n${errorMessages}`);
		}

		this.logger.info('Server entry file bundled successfully');
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
			router: RouteRegistry;
			routeRendererFactory: StaticGenerationRendererResolver;
			staticRoutes?: StaticRoute[];
		},
	): Promise<void> {
		const { preview = false, baseUrl: explicitBaseUrl } = options ?? {};

		const baseUrl =
			explicitBaseUrl ??
			`http://${this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME}:${this.serveOptions.port || DEFAULT_ECOPAGES_PORT}`;

		this.prepareExportDirectory();
		await this.refreshRuntimeAssets();
		await this.bundleServerEntry();

		await this.staticSiteGenerator.run({
			router: dependencies.router,
			baseUrl,
			routeRendererFactory: dependencies.routeRendererFactory,
			staticRoutes: dependencies.staticRoutes,
		});

		if (!preview) {
			this.logger.info('Build completed');
			return;
		}

		const previewPort = this.serveOptions.port || DEFAULT_ECOPAGES_PORT;

		const { server } = this.previewServerFactory.createServer({
			appConfig: this.appConfig,
			options: { port: Number(previewPort) },
		});

		if (server?.port) {
			this.logger.info(`Preview running at http://localhost:${server.port}`);
		} else {
			this.logger.error('Failed to start preview server');
		}
	}
}
