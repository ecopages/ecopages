import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import { build, getAppBuildAdapter, setupAppRuntimePlugins } from '../../build/build-adapter.ts';
import { createServerBuildRequest } from '../../build/runtime/build-request-policy.ts';
import { requireBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { attachHmrToIntegrations } from './runtime-server-lifecycle.ts';
import {
	getServerBundleOutputPaths,
	lookupServerEntryBuildCache,
	recordServerEntryBuildCache,
	writeServerBundleDeployManifest,
} from '../../build/cache/server-entry-build-cache.ts';
import {
	clearProductionBuildCaches,
	shouldResetStaticExportDirectory,
} from '../../static-site-generator/static-build-invalidation.ts';
import { resolveEntryFile, SERVER_BUNDLE_FILENAME } from '../../utils/resolve-entry-file.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../../types/internal-types.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import type { StaticRoute } from '../../types/public-types.ts';
import type { RouteRegistry } from '../../router/server/route-registry.ts';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import type { StaticGenerationRendererResolver } from '../../route-renderer/route-renderer.ts';

export interface StaticBuildOptions {
	baseUrl?: string;
	force?: boolean;
}

export interface ServeOptions {
	hostname?: string;
	port?: number | string;
}

export interface ServerStaticBuilderParams {
	appConfig: EcoPagesAppConfig;
	staticSiteGenerator: StaticSiteGenerator;
	serveOptions: ServeOptions;
	runtimeOrigin: string;
	/**
	 * Whether the app requires a server entry bundle for production use.
	 * When `true`, the build step bundles the server entry file for `ecopages start`.
	 * Defaults to `false` (static-only build, no server needed).
	 */
	needsServerBundle?: boolean;
	logger?: ServerStaticBuilderLogger;
	entryFile?: string;
	hmrManager?: IHmrManager;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
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
 * Handles static site generation.
 */
export class ServerStaticBuilder {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly staticSiteGenerator: StaticSiteGenerator;
	private readonly serveOptions: ServeOptions;
	private readonly runtimeOrigin: string;
	private readonly needsServerBundle: boolean;
	private readonly logger: ServerStaticBuilderLogger;
	private readonly entryFile: string;
	private readonly hmrManager?: IHmrManager;
	private readonly onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;

	constructor({
		appConfig,
		staticSiteGenerator,
		serveOptions,
		runtimeOrigin,
		needsServerBundle,
		logger,
		entryFile,
		hmrManager,
		onRuntimePlugin,
	}: ServerStaticBuilderParams) {
		this.appConfig = appConfig;
		this.staticSiteGenerator = staticSiteGenerator;
		this.serveOptions = serveOptions;
		this.runtimeOrigin = runtimeOrigin;
		this.needsServerBundle = needsServerBundle ?? false;
		this.logger = logger ?? appLogger;
		this.entryFile = resolveEntryFile({ entryFile });
		this.hmrManager = hmrManager;
		this.onRuntimePlugin = onRuntimePlugin;
	}

	private prepareExportDirectory(force: boolean): boolean {
		if (force) {
			clearProductionBuildCaches(this.appConfig);
		}

		const exportDir =
			this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, this.appConfig.distDir);
		const shouldCleanDist = shouldResetStaticExportDirectory(this.appConfig, force);
		fileSystem.ensureDir(exportDir, shouldCleanDist);

		if (shouldCleanDist) {
			this.appConfig.runtime = {
				...(this.appConfig.runtime ?? {}),
				runtimeAssetsPrepared: false,
			};
		}

		const srcPublicDir = path.join(
			this.appConfig.rootDir,
			this.appConfig.srcDir ?? 'src',
			this.appConfig.publicDir ?? 'public',
		);
		if (fileSystem.exists(srcPublicDir)) {
			fileSystem.copyDir(srcPublicDir, exportDir);
		}

		return !shouldCleanDist;
	}

	private async refreshRuntimeAssets(): Promise<void> {
		appLogger.debugTime('refreshRuntimeAssets');
		try {
			await setupAppRuntimePlugins({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
				onRuntimePlugin: this.onRuntimePlugin,
			});

			if (this.hmrManager?.isEnabled()) {
				attachHmrToIntegrations(this.appConfig, this.hmrManager);
			}
		} finally {
			appLogger.debugTimeEnd('refreshRuntimeAssets');
		}
	}

	/**
	 * Bundles the server entry file for production use.
	 *
	 * @remarks
	 * Only invoked when the app requires a runtime server (API handlers,
	 * websocket handlers, etc.). Static-only apps skip this step entirely.
	 * Incremental builds may skip Rolldown when the `.eco/.server-entry`
	 * cache is still valid.
	 *
	 * Package imports remain external so native addons and runtime-owned
	 * dependencies continue to load through the app's installed
	 * `node_modules` tree. Only the app entry graph is bundled.
	 *
	 * Throws if the build adapter is unavailable, is owned by a host
	 * runtime, or bundling fails.
	 *
	 * @throws If the build adapter is unavailable, is host-owned, or bundling fails.
	 */
	private async bundleServerEntry(options?: { force?: boolean }): Promise<void> {
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

		const { serverOutdir, serverEntryPath } = getServerBundleOutputPaths(this.appConfig);
		const cached = lookupServerEntryBuildCache({
			appConfig: this.appConfig,
			entryPath,
			force: options?.force,
		});

		if (cached) {
			const hasBundle = cached.outputPaths.some(
				(outputPath) =>
					path.resolve(outputPath) === path.resolve(serverEntryPath) && fileSystem.exists(outputPath),
			);
			if (hasBundle) {
				this.logger.info('Reusing cached server entry bundle');
				writeServerBundleDeployManifest(this.appConfig, serverEntryPath);
				return;
			}
		}

		this.logger.info('Bundling server entry file...');

		const buildOptions = createServerBuildRequest(this.appConfig, {
			profile: 'server-entry',
			entrypoints: [entryPath],
			outdir: serverOutdir,
			naming: SERVER_BUNDLE_FILENAME,
			sourcemap: 'hidden',
		});

		const result = await build(buildOptions, requireBuildRuntime(this.appConfig).getProfile('server-entry'));

		if (!result.success) {
			const errorMessages = result.logs.map((log) => log.message).join('\n');
			throw new Error(`Failed to bundle server entry file:\n${errorMessages}`);
		}

		const outputPaths =
			result.outputs.length > 0
				? result.outputs.map((output) => output.path)
				: fileSystem.exists(serverEntryPath)
					? [serverEntryPath]
					: [];

		recordServerEntryBuildCache({
			appConfig: this.appConfig,
			entryPath,
			buildResult: result,
			outputPaths,
		});
		writeServerBundleDeployManifest(this.appConfig, serverEntryPath);

		this.logger.info('Server entry file bundled successfully');
	}

	/**
	 * Generates a static build of the site for deployment.
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
		const { baseUrl: explicitBaseUrl, force = false } = options ?? {};

		const baseUrl =
			explicitBaseUrl ??
			`http://${this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME}:${this.serveOptions.port || DEFAULT_ECOPAGES_PORT}`;

		const preserveExportDirectory = this.prepareExportDirectory(force);
		await this.refreshRuntimeAssets();

		if (this.needsServerBundle) {
			await this.bundleServerEntry({ force });
		}

		await this.staticSiteGenerator.run({
			router: dependencies.router,
			baseUrl,
			routeRendererFactory: dependencies.routeRendererFactory,
			staticRoutes: dependencies.staticRoutes,
			force,
			preserveExportDirectory,
		});

		if (process.env.ECOPAGES_BENCH === '1' && process.env.ECOPAGES_BENCH_VERBOSE !== '1') {
			this.logger.debug('Build completed');
		} else {
			this.logger.info('Build completed');
		}
	}
}
