/**
 * Bootstrap helpers for static-build benchmarks.
 *
 * Uses the real kitchen-sink project (`createKitchenSinkConfig` / `eco.config.ts`)
 * with isolated dist/work dirs so bench runs do not clobber a developer's normal
 * `dist/` or `.eco/` output. Sources, routes, integrations, and processors are
 * unchanged — only artifact output paths differ.
 */

import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { setupAppRuntimePlugins } from '../../../packages/core/src/build/build-adapter.ts';
import { installAppRuntimeBuildExecutor } from '../../../packages/core/src/build/runtime-build-executor.ts';
import { createNodeServerAdapter } from '../../../packages/core/src/adapters/node/server-adapter.ts';
import { RouteRegistry } from '../../../packages/core/src/router/server/route-registry.ts';
import { RouteRendererFactory } from '../../../packages/core/src/route-renderer/route-renderer.ts';
import { StaticSiteGenerator } from '../../../packages/core/src/static-site-generator/static-site-generator.ts';
import {
	createAppModuleLoader,
	getAppServerModuleTranspiler,
} from '../../../packages/core/src/services/module-loading/app-server-module-transpiler.service.ts';
import { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../../../packages/core/src/services/module-loading/route-module-build-manifest.ts';
import { SERVER_ENTRY_BUILD_CACHE_FILENAME } from '../../../packages/core/src/build/server-entry-build-cache.ts';
import { PAGES_UNIFIED_GRAPH_CACHE_FILENAME } from '../../../packages/core/src/build/pages-unified-graph-build.ts';
import { resolveInternalExecutionDir } from '../../../packages/core/src/utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../../../packages/core/src/types/internal-types.ts';
import type { EcoPageFile } from '../../../packages/core/src/types/public-types.ts';
import { loadKitchenSinkConfig } from './_kitchen-sink-fixture.ts';

/** Isolated artifact dirs under kitchen-sink; sources remain the full app tree. */
export const STATIC_BUILD_BENCH_SCOPE = '__bench-static-build__';
const BENCH_DIST_DIR = path.join('dist', STATIC_BUILD_BENCH_SCOPE);
const BENCH_WORK_DIR = path.join('.eco', STATIC_BUILD_BENCH_SCOPE);

let cachedBenchAdapter:
	| {
			configKey: string;
			adapter: Awaited<ReturnType<typeof createNodeServerAdapter>>;
	  }
	| undefined;
let cachedGenerationStack:
	| {
			configKey: string;
			stack: {
				appConfig: EcoPagesAppConfig;
				router: RouteRegistry;
				routeRendererFactory: RouteRendererFactory;
				staticSiteGenerator: StaticSiteGenerator;
			};
	  }
	| undefined;
let diskColdCounter = 0;

function getBenchConfigKey(appConfig: EcoPagesAppConfig): string {
	return `${appConfig.absolutePaths.distDir}::${appConfig.absolutePaths.workDir}`;
}

/** Kitchen-sink config with bench-scoped artifact dirs (full app, isolated output). */
export async function loadStaticBuildBenchConfig(): Promise<EcoPagesAppConfig> {
	return loadKitchenSinkConfig({
		distDir: BENCH_DIST_DIR,
		workDir: BENCH_WORK_DIR,
	});
}

/** Kitchen-sink config with production `dist/` and `.eco/` paths. */
export async function loadKitchenSinkProductionConfig(): Promise<EcoPagesAppConfig> {
	return loadKitchenSinkConfig();
}

export function clearBenchProductionCaches(appConfig: EcoPagesAppConfig): void {
	const executionDir = resolveInternalExecutionDir(appConfig);
	for (const subdir of ['.server-modules', '.server-route-modules'] as const) {
		const manifestPath = path.join(executionDir, subdir, ROUTE_MODULE_BUILD_CACHE_FILENAME);
		if (fileSystem.exists(manifestPath)) {
			fileSystem.remove(manifestPath);
		}
	}

	const serverEntryCachePath = path.join(executionDir, '.server-entry', SERVER_ENTRY_BUILD_CACHE_FILENAME);
	if (fileSystem.exists(serverEntryCachePath)) {
		fileSystem.remove(serverEntryCachePath);
	}

	const pagesGraphCachePath = path.join(executionDir, '.server-pages-graph', PAGES_UNIFIED_GRAPH_CACHE_FILENAME);
	if (fileSystem.exists(pagesGraphCachePath)) {
		fileSystem.remove(pagesGraphCachePath);
	}

	appConfig.runtime?.routeModuleBuildCaches?.clear();
	cachedBenchAdapter = undefined;
	cachedGenerationStack = undefined;
	diskColdCounter = 0;
}

export function nextDiskColdOutdir(appConfig: EcoPagesAppConfig): string {
	diskColdCounter += 1;
	return path.join(resolveInternalExecutionDir(appConfig), `__bench-cold-${diskColdCounter}`);
}

export async function importRouteModuleDiskCold(appConfig: EcoPagesAppConfig, filePath: string): Promise<void> {
	installAppRuntimeBuildExecutor(appConfig);
	const loader = createAppModuleLoader(appConfig);

	await loader.importModule({
		filePath,
		rootDir: appConfig.rootDir,
		outdir: nextDiskColdOutdir(appConfig),
		externalPackages: true,
	});
}

export async function bootstrapStaticGenerationStack(appConfig: EcoPagesAppConfig): Promise<{
	appConfig: EcoPagesAppConfig;
	router: RouteRegistry;
	routeRendererFactory: RouteRendererFactory;
	staticSiteGenerator: StaticSiteGenerator;
}> {
	const configKey = getBenchConfigKey(appConfig);
	if (cachedGenerationStack?.configKey === configKey) {
		return cachedGenerationStack.stack;
	}

	const runtimeOrigin = 'http://127.0.0.1:3000';

	installAppRuntimeBuildExecutor(appConfig);
	await setupAppRuntimePlugins({
		appConfig,
		runtimeOrigin,
	});

	const serverModuleTranspiler = getAppServerModuleTranspiler(appConfig);
	const router = new RouteRegistry({
		pagesDir: path.join(appConfig.rootDir, appConfig.srcDir, appConfig.pagesDir),
		appConfig,
		origin: runtimeOrigin,
		templatesExt: appConfig.templatesExt,
		buildMode: true,
		pageModuleAdapter: {
			loadPageModule: async (filePath) => {
				const module = (await serverModuleTranspiler.importModule({
					filePath,
					outdir: path.join(resolveInternalExecutionDir(appConfig), '.server-route-modules'),
					externalPackages: true,
					transpileErrorMessage: (details) => `Error transpiling route module: ${details}`,
					noOutputMessage: (targetFilePath) =>
						`No transpiled output generated for route module: ${targetFilePath}`,
				})) as EcoPageFile;

				const page = module.default;

				return {
					staticPaths: page?.staticPaths ?? module.getStaticPaths,
					staticProps: page?.staticProps ?? module.getStaticProps,
				};
			},
		},
	});
	await router.init();

	const routeRendererFactory = new RouteRendererFactory({
		appConfig,
		runtimeOrigin,
	});
	const staticSiteGenerator = new StaticSiteGenerator({ appConfig });

	const stack = {
		appConfig,
		router,
		routeRendererFactory,
		staticSiteGenerator,
	};
	cachedGenerationStack = { configKey, stack };
	return stack;
}

export async function runStaticSiteGeneration(
	appConfig: EcoPagesAppConfig,
	options?: {
		force?: boolean;
		preserveExportDirectory?: boolean;
	},
): Promise<void> {
	const stack = await bootstrapStaticGenerationStack(appConfig);

	await stack.staticSiteGenerator.run({
		router: stack.router,
		baseUrl: 'http://127.0.0.1:3000',
		routeRendererFactory: stack.routeRendererFactory,
		force: options?.force ?? false,
		preserveExportDirectory: options?.preserveExportDirectory ?? !options?.force,
	});
}

export async function getStaticBuildBenchAdapter(
	appConfig: EcoPagesAppConfig,
): Promise<Awaited<ReturnType<typeof createNodeServerAdapter>>> {
	const configKey = getBenchConfigKey(appConfig);
	if (cachedBenchAdapter?.configKey === configKey) {
		return cachedBenchAdapter.adapter;
	}

	const adapter = await createNodeServerAdapter({
		appConfig,
		runtimeOrigin: 'http://127.0.0.1:3000',
		serveOptions: { hostname: '127.0.0.1', port: 0 },
		options: { watch: false },
	});

	cachedBenchAdapter = { configKey, adapter };
	return adapter;
}

export async function runBuildStatic(appConfig: EcoPagesAppConfig, options?: { force?: boolean }): Promise<void> {
	const adapter = await getStaticBuildBenchAdapter(appConfig);
	await adapter.buildStatic({ preview: false, force: options?.force ?? false });
}

export async function loadStaticBuildBenchConfigWithScope(scope: string): Promise<EcoPagesAppConfig> {
	return loadKitchenSinkConfig({
		distDir: path.join('dist', scope),
		workDir: path.join('.eco', scope),
	});
}
