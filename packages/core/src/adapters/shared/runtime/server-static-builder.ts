import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../../config/constants.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { setupAppRuntimePlugins } from '../../../build/build-adapter.ts';
import {
	createServerBundleStagingDirectory,
	publishServerBundleDirectory,
	removeServerBundleStagingDirectory,
} from '../../../build/server-bundle-publication.ts';
import { createServerBuildRequest } from '../../../build/runtime/build-request-policy.ts';
import { buildOrThrow } from '../../../build/runtime/build-queue.ts';
import { attachHmrToIntegrations } from './runtime-server-lifecycle.ts';
import {
	getServerBundleOutputPaths,
	writeServerBundleDeployManifest,
} from '../../../build/server-bundle-deploy-manifest.ts';
import { bundleEcoConfigModule, EMITTED_ECO_CONFIG_FILENAME } from '../../../config/server-config-bundle.ts';
import { resolveEntryFile, SERVER_BUNDLE_FILENAME } from '../../../utils/resolve-entry-file.ts';
import type { AppRuntime } from '../../../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { ErrorPageLoaders, StaticRoute } from '../../../types/public-types.ts';
import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { StaticSiteGenerator } from '../../../static-site-generator/static-site-generator.ts';
import type { StaticGenerationRendererResolver } from '../../../route-renderer/route-renderer.ts';
import { copyRuntimePublicDirIfChanged } from './copy-runtime-public-dir.ts';

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
	runtime: AppRuntime;
	staticSiteGenerator: StaticSiteGenerator;
	serveOptions: ServeOptions;
	/**
	 * Whether the app requires a server entry bundle for production use.
	 * When `true`, the build step bundles the server entry file for `ecopages start`.
	 * Defaults to `false` (static-only build, no server needed).
	 */
	needsServerBundle?: boolean;
	logger?: ServerStaticBuilderLogger;
	entryFile?: string;
}

/**
 * Minimal logger dependency used by the static builder.
 */
export interface ServerStaticBuilderLogger {
	warn(message: string, detail?: string): unknown;
	info(message: string): unknown;
	debug(message: string): unknown;
	error(message: string): unknown;
}

/**
 * Handles static site generation.
 */
export class ServerStaticBuilder {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly runtime: AppRuntime;
	private readonly staticSiteGenerator: StaticSiteGenerator;
	private serveOptions: ServeOptions;
	private readonly needsServerBundle: boolean;
	private readonly logger: ServerStaticBuilderLogger;
	private readonly entryFile: string;
	private exportPrepared = false;

	constructor({
		appConfig,
		runtime,
		staticSiteGenerator,
		serveOptions,
		needsServerBundle,
		logger,
		entryFile,
	}: ServerStaticBuilderParams) {
		this.appConfig = appConfig;
		this.runtime = runtime;
		this.staticSiteGenerator = staticSiteGenerator;
		this.serveOptions = serveOptions;
		this.needsServerBundle = needsServerBundle ?? false;
		this.logger = logger ?? appLogger;
		this.entryFile = resolveEntryFile({ entryFile });
	}

	/** Keeps build-time URLs aligned with the server's actual listening port. */
	setRuntimeBinding(input: { port: number; runtimeOrigin: string }): void {
		this.serveOptions = { ...this.serveOptions, port: input.port };
	}

	/**
	 * Empties `dist/` and copies the public directory into it.
	 *
	 * @remarks
	 * Every build renders from source in a fresh process, so nothing in a previous `dist/` is reusable.
	 */
	private prepareExportDirectory(): void {
		const exportDir =
			this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, this.appConfig.distDir);
		fileSystem.ensureDir(exportDir, true);

		this.runtime.runtimeAssetsPrepared = false;

		const srcPublicDir = path.join(
			this.appConfig.rootDir,
			this.appConfig.srcDir ?? 'src',
			this.appConfig.publicDir ?? 'public',
		);
		if (fileSystem.exists(srcPublicDir)) {
			copyRuntimePublicDirIfChanged(srcPublicDir, exportDir);
		}
	}

	/**
	 * Empties `dist/`, copies the public directory into it and sets the Processors and Integrations up.
	 *
	 * @remarks
	 * Call it before the router reads any Page, so a Page module that resolves what a Processor generates in
	 * `setup()` finds it. The next {@link build} then skips this work once; a build without a prior call prepares
	 * the export itself.
	 */
	async prepareExport(): Promise<void> {
		this.prepareExportDirectory();
		await this.refreshRuntimeAssets();
		this.exportPrepared = true;
	}

	private async refreshRuntimeAssets(): Promise<void> {
		appLogger.debugTime('refreshRuntimeAssets');
		try {
			await setupAppRuntimePlugins({
				appConfig: this.appConfig,
			});

			if (this.runtime.hmr?.isEnabled()) {
				attachHmrToIntegrations(this.appConfig);
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
	 * Every process bundles the entry from source.
	 *
	 * Source code is bundled: the app entry graph, workspace packages and
	 * TypeScript packages such as Core. Compiled packages from `node_modules`
	 * stay external (bare when the app declares them, otherwise relative to
	 * `dist/.server/`), so native bindings load from the installed tree. The
	 * entry is written to a staging directory, so the request passes
	 * `runtimeOutdir` and bundled `import.meta` reads resolve against the
	 * sources from `dist/.server/`.
	 *
	 * Throws if the build adapter is unavailable or bundling fails.
	 *
	 * @throws If the build adapter is unavailable or bundling fails.
	 */
	private async bundleServerEntry(): Promise<void> {
		const entryPath = path.isAbsolute(this.entryFile)
			? this.entryFile
			: path.join(this.appConfig.rootDir, this.entryFile);

		if (!fileSystem.exists(entryPath)) {
			throw new Error(
				`Cannot bundle server entry: file "${this.entryFile}" not found in "${this.appConfig.rootDir}".`,
			);
		}

		const { serverOutdir } = getServerBundleOutputPaths(this.appConfig);

		this.logger.info('Bundling server entry file...');
		const stagingDir = createServerBundleStagingDirectory(serverOutdir);
		try {
			const configBundle = await bundleEcoConfigModule(this.appConfig, {
				outputDir: stagingDir,
				runtimeDir: serverOutdir,
			});
			const stagedServerEntryPath = path.join(stagingDir, SERVER_BUNDLE_FILENAME);
			const buildOptions = createServerBuildRequest(this.appConfig, {
				reportPackagesOutsideRoot: true,
				entrypoints: [entryPath],
				outdir: stagingDir,
				naming: SERVER_BUNDLE_FILENAME,
				sourcemap: 'linked',
				runtimeOutdir: serverOutdir,
			});
			await buildOrThrow(this.appConfig, buildOptions, 'Failed to bundle server entry file');

			writeServerBundleDeployManifest(this.appConfig, stagedServerEntryPath, {
				emittedConfigModule: configBundle ? EMITTED_ECO_CONFIG_FILENAME : undefined,
				outputDir: stagingDir,
			});

			publishServerBundleDirectory(stagingDir, serverOutdir);
		} finally {
			removeServerBundleStagingDirectory(stagingDir);
		}

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
			errorPageLoaders?: ErrorPageLoaders;
		},
	): Promise<void> {
		const { baseUrl: explicitBaseUrl, force = false } = options ?? {};

		const baseUrl =
			explicitBaseUrl ??
			`http://${this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME}:${this.serveOptions.port || DEFAULT_ECOPAGES_PORT}`;

		if (!this.exportPrepared) {
			await this.prepareExport();
		}
		this.exportPrepared = false;

		if (this.needsServerBundle) {
			await this.bundleServerEntry();
		}

		await this.staticSiteGenerator.run({
			router: dependencies.router,
			baseUrl,
			routeRendererFactory: dependencies.routeRendererFactory,
			staticRoutes: dependencies.staticRoutes,
			errorPageLoaders: dependencies.errorPageLoaders,
			force,
		});

		if (process.env.ECOPAGES_BENCH === '1' && process.env.ECOPAGES_BENCH_VERBOSE !== '1') {
			this.logger.debug('Build completed');
		} else {
			this.logger.info('Build completed');
		}
	}
}
