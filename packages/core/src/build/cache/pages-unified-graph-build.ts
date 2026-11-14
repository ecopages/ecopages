/**
 * Unified production server-module graph.
 *
 * `ecopages build` emits every server entry into `dist/server/` and writes
 * `server-modules.json`. `ecopages start` imports those modules and never compiles.
 */

import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { isEcopagesEnvDisabled } from '../../env.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import {
	requireBrowserBuildGlobalScriptResolution,
	setupAppRuntimeIntegrations,
} from '../app-build-manifest-runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import { buildOrThrow } from '../runtime/build-queue.ts';
import { createServerBuildRequest } from '../runtime/build-request-policy.ts';
import { getBuildEntryOutput } from '../build-graph.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { ErrorPageLoaders, StaticRoute } from '../../types/contracts.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import {
	type ProductionServerModulesManifest,
	loadProductionServerModules,
	writeProductionServerModulesManifest,
} from '../server/server-modules-manifest.ts';
import { getServerBundleOutputPaths } from '../server-bundle-deploy-manifest.ts';
import { ensureProductionBuildId } from '../production-build-id.ts';
import {
	collectServerModuleEntries,
	isRolldownServerModuleEntry,
	type ServerModuleEntryRouteSource,
} from './server-module-entries.ts';

/**
 * True when a production build should emit the server-modules map.
 *
 * @remarks
 * Enabled by default in production builds. `ECOPAGES_UNIFIED_PAGES_GRAPH=false` or `0` opts out, which the
 * bench parity suite uses as its per-page build oracle. Production `ecopages start` still requires
 * the emitted server-modules map from a build that did emit.
 */
export function shouldBuildPagesUnifiedGraph(): boolean {
	return !isEcopagesEnvDisabled('ECOPAGES_UNIFIED_PAGES_GRAPH') && isProductionRuntime();
}

/**
 * @remarks
 * Pages of an Integration that compiles its own modules (`compilePageModule`), such as
 * HTML Pages, are not bundled, so they stay out of the Rolldown graph.
 */
export function isPagesUnifiedGraphPage(filePath: string, appConfig: EcoPagesAppConfig): boolean {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	return owner !== undefined && !owner.compilePageModule;
}

/**
 * Readable output stem unique for every source path.
 *
 * @remarks
 * Sanitizing `src/pages/foo-bar` and `src/pages/foo/bar` would otherwise yield
 * the same stem and overwrite one emitted module with the other.
 */
function createSafeGraphEntryKey(entryPath: string, rootDir: string): string {
	const sourceKey = toRootRelativePath(rootDir, entryPath);
	const relativePath = sourceKey.replace(/\.[^.]+$/u, '');
	const readable = relativePath.replace(/[^a-zA-Z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
	return `${readable.length > 0 ? readable : 'page'}-${contentHash(sourceKey, 8)}`;
}

function uniqueEntryPaths(entryPaths: readonly string[]): string[] {
	return [...new Set(entryPaths.map((entryPath) => path.resolve(entryPath)))];
}

async function emitCompiledPageModule(
	appConfig: EcoPagesAppConfig,
	filePath: string,
	outdir: string,
): Promise<{ sourceKey: string; relativePath: string; outputPath: string }> {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	if (!owner?.compilePageModule) {
		throw new Error(`No compilePageModule implementation for ${filePath}`);
	}
	if (!owner.serializeCompiledPageModule) {
		throw new Error(`No serializeCompiledPageModule implementation for ${filePath}`);
	}

	const compiled = await owner.compilePageModule(filePath, appConfig);
	const { contents } = owner.serializeCompiledPageModule(compiled, { rootDir: appConfig.rootDir, filePath });

	const sourceKey = toRootRelativePath(appConfig.rootDir, filePath);
	const relativePath = `${createSafeGraphEntryKey(filePath, appConfig.rootDir)}-html.json`;
	const outputPath = path.join(outdir, relativePath);
	fileSystem.ensureDir(outdir);
	fileSystem.write(outputPath, contents);
	return { sourceKey, relativePath, outputPath };
}

function reviveCompiledPageModuleFromDisk(appConfig: EcoPagesAppConfig, filePath: string, outputPath: string): unknown {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	if (!owner?.reviveCompiledPageModule) {
		throw new Error(`No reviveCompiledPageModule implementation for ${filePath}`);
	}
	return owner.reviveCompiledPageModule(fileSystem.readFileSync(outputPath).toString(), {
		rootDir: appConfig.rootDir,
		filePath,
	});
}

export async function importEmittedServerModule<T>(
	appConfig: EcoPagesAppConfig,
	filePath: string,
	outputPath: string,
): Promise<T> {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	if (owner?.reviveCompiledPageModule) {
		return reviveCompiledPageModuleFromDisk(appConfig, filePath, outputPath) as T;
	}
	return (await import(/* @vite-ignore */ path.toFileUrl(outputPath).href)) as T;
}

async function emitRolldownServerModules(
	appConfig: EcoPagesAppConfig,
	entryPaths: readonly string[],
	outdir: string,
): Promise<{ modules: Record<string, string>; sources: string[] }> {
	if (entryPaths.length === 0) {
		return { modules: {}, sources: [] };
	}

	const entryRecord: Record<string, string> = {};
	for (const entryPath of entryPaths) {
		entryRecord[createSafeGraphEntryKey(entryPath, appConfig.rootDir)] = entryPath;
	}

	appLogger.debugTime('pagesUnifiedGraphBuild');
	const buildOptions = createServerBuildRequest(appConfig, {
		entrypoints: entryRecord,
		outdir,
		splitting: true,
		preserveModules: true,
		preserveModulesRoot: appConfig.rootDir,
		naming: '[name]-[hash].[ext]',
		ssrScriptEntries: true,
	});
	const buildResult = await buildOrThrow(appConfig, buildOptions, 'Pages unified graph build failed').finally(() =>
		appLogger.debugTimeEnd('pagesUnifiedGraphBuild'),
	);

	const modules: Record<string, string> = {};
	for (const entryPath of entryPaths) {
		const compiledOutput = getBuildEntryOutput(buildResult, entryPath, appConfig.rootDir);
		if (!compiledOutput) {
			throw new Error(`Pages unified graph build produced no output for ${entryPath}`);
		}
		modules[toRootRelativePath(appConfig.rootDir, entryPath)] = toRootRelativePath(outdir, compiledOutput);
	}
	for (const [outputPath, chunk] of Object.entries(buildResult.outputGraph)) {
		if (chunk.isEntry && chunk.facadeModuleId) {
			modules[toRootRelativePath(appConfig.rootDir, chunk.facadeModuleId)] ??= toRootRelativePath(
				outdir,
				outputPath,
			);
		}
	}
	const sources = [...new Set(Object.values(buildResult.dependencyGraph.entrypoints).flat())];
	return { modules, sources };
}

function assignProductionServerModules(appConfig: EcoPagesAppConfig, manifest: ProductionServerModulesManifest): void {
	const runtime = requireAppRuntime(appConfig);
	runtime.productionServerModules = manifest;
}

/**
 * Emits every production server entry into `outdir` and writes `server-modules.json`.
 *
 * @remarks
 * The `ssr: true` scripts that declarations list are entries of the same build (see
 * `createSsrScriptEntriesPlugin`), so every module is bundled once and none is evaluated from two copies.
 */
export async function emitProductionServerModules(options: {
	appConfig: EcoPagesAppConfig;
	router: ServerModuleEntryRouteSource;
	staticRoutes?: readonly StaticRoute[];
	errorPageLoaders?: ErrorPageLoaders;
	outdir?: string;
	/** Receives the project and package source files the server build bundled, after it succeeds. */
	onServerSources?: (sources: readonly string[]) => void | Promise<void>;
}): Promise<ProductionServerModulesManifest> {
	const appConfig = options.appConfig;
	requireBrowserBuildGlobalScriptResolution(appConfig);
	await setupAppRuntimeIntegrations({ appConfig });
	const outdir = path.resolve(options.outdir ?? getServerBundleOutputPaths(appConfig).serverOutdir);
	fileSystem.ensureDir(outdir);

	const collected = collectServerModuleEntries({
		appConfig,
		router: options.router,
		staticRoutes: options.staticRoutes,
		errorPageLoaders: options.errorPageLoaders,
	});

	const rolldownEntries = collected.filter((entryPath) => isRolldownServerModuleEntry(entryPath, appConfig));
	const htmlEntries = collected.filter((entryPath) => !isRolldownServerModuleEntry(entryPath, appConfig));

	const { modules, sources } = await emitRolldownServerModules(appConfig, uniqueEntryPaths(rolldownEntries), outdir);
	await options.onServerSources?.(sources);

	for (const htmlEntry of uniqueEntryPaths(htmlEntries)) {
		const emitted = await emitCompiledPageModule(appConfig, htmlEntry, outdir);
		modules[emitted.sourceKey] = emitted.relativePath;
	}

	const manifest: ProductionServerModulesManifest = {
		outdir,
		buildId: ensureProductionBuildId(appConfig),
		modules,
	};
	assignProductionServerModules(appConfig, manifest);
	writeProductionServerModulesManifest(manifest);

	appLogger.debug(`Emitted ${Object.keys(modules).length} production server modules`);
	return manifest;
}

/**
 * Imports the emitted module for `filePath` from the production server-modules map.
 *
 * @remarks
 * Resolves `undefined` when no map was emitted or it does not list the file.
 */
export async function importPagesUnifiedGraphModule<T>(
	appConfig: EcoPagesAppConfig,
	filePath: string,
): Promise<T | undefined> {
	const manifest = loadProductionServerModules(appConfig);
	if (!manifest) {
		return undefined;
	}

	const sourceKey = toRootRelativePath(appConfig.rootDir, filePath);
	const relativePath = manifest.modules[sourceKey];
	if (!relativePath) {
		return undefined;
	}
	const outputPath = path.join(manifest.outdir, relativePath);
	if (!fileSystem.exists(outputPath)) {
		return undefined;
	}

	return importEmittedServerModule<T>(appConfig, filePath, outputPath);
}
