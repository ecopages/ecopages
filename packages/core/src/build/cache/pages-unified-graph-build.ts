/**
 * Unified production server-module graph.
 *
 * `ecopages build` emits every server entry into `dist/.server/` and writes
 * `server-modules.json`. `ecopages start` imports those modules and never compiles.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { isEcopagesEnvDisabled } from '../../env.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { setupAppRuntimeIntegrations } from '../app-build-manifest-runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import { buildOrThrow } from '../runtime/build-queue.ts';
import { createServerBuildRequest } from '../runtime/build-request-policy.ts';
import { getBuildEntryOutput } from '../build-graph.ts';
import type { BuildSuccess } from '../build-adapter.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { ErrorPageLoaders, StaticRoute } from '../../types/contracts.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import {
	type ProductionServerModulesManifest,
	loadProductionServerModules,
	matchProductionModuleKey,
	writeProductionServerModulesManifest,
} from '../server/server-modules-manifest.ts';
import { getServerBundleOutputPaths } from '../server-bundle-deploy-manifest.ts';
import { ensureProductionBuildId } from '../production-build-id.ts';
import {
	collectServerModuleEntries,
	collectSsrScriptPaths,
	isRolldownServerModuleEntry,
	type ServerModuleEntryRouteSource,
} from './server-module-entries.ts';

/**
 * True when the unified graph should build or serve prebuilt page modules.
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

/**
 * Points `identity.file` at the current app root when the emitted module still
 * names the build machine, so a copied `dist/` does not read that path.
 *
 * @remarks
 * Relative `dependencies.scripts` resolve from this directory, so the remap
 * keeps the source key. Emitting the module path here breaks the asset
 * pipeline (`./hello.script.ts` would resolve under `dist/.server/`).
 */
function remapProductionIdentityFile(identity: { file?: string } | undefined, appConfig: EcoPagesAppConfig): void {
	if (!identity?.file) {
		return;
	}
	const manifest = loadProductionServerModules(appConfig);
	if (!manifest) {
		return;
	}
	const key = matchProductionModuleKey(appConfig.rootDir, identity.file, manifest.modules);
	if (key) {
		identity.file = path.resolve(appConfig.rootDir, key);
	}
}

function remapLoadedModuleIdentities(loaded: object, appConfig: EcoPagesAppConfig): void {
	for (const value of Object.values(loaded)) {
		if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
			continue;
		}
		const record = value as { config?: { identity?: { file?: string } }; identity?: { file?: string } };
		remapProductionIdentityFile(record.config?.identity ?? record.identity, appConfig);
	}
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
	const loaded = (await import(/* @vite-ignore */ pathToFileURL(outputPath).href)) as T;
	if (loaded && typeof loaded === 'object') {
		remapLoadedModuleIdentities(loaded, appConfig);
	}
	return loaded;
}

async function emitRolldownServerModules(
	appConfig: EcoPagesAppConfig,
	entryPaths: readonly string[],
	outdir: string,
): Promise<{ modules: Record<string, string>; outputGraph: BuildSuccess['outputGraph'] }> {
	if (entryPaths.length === 0) {
		return { modules: {}, outputGraph: {} };
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
		modules[toRootRelativePath(appConfig.rootDir, entryPath)] = path
			.relative(outdir, compiledOutput)
			.split(path.sep)
			.join('/');
	}
	return { modules, outputGraph: buildResult.outputGraph };
}

function resolveEmittedModuleId(moduleId: string): string | undefined {
	if (moduleId.startsWith('\0')) return undefined;
	const filePath = moduleId.startsWith('file:') ? fileURLToPath(moduleId) : moduleId;
	return path.isAbsolute(filePath) ? path.resolve(filePath) : undefined;
}

function findEmittedModulePath(outputGraph: BuildSuccess['outputGraph'], sourcePath: string): string | undefined {
	const resolvedSource = path.resolve(sourcePath);
	for (const [outputPath, chunk] of Object.entries(outputGraph)) {
		if (chunk.modules?.some((moduleId) => resolveEmittedModuleId(moduleId) === resolvedSource)) {
			return outputPath;
		}
	}
	return undefined;
}

async function importEmittedModules(
	manifest: ProductionServerModulesManifest,
	sourceKeys: readonly string[],
): Promise<unknown[]> {
	const modules: unknown[] = [];
	for (const sourceKey of sourceKeys) {
		const relativePath = manifest.modules[sourceKey];
		if (!relativePath) {
			continue;
		}
		modules.push(await import(/* @vite-ignore */ pathToFileURL(path.join(manifest.outdir, relativePath)).href));
	}
	return modules;
}

function assignProductionServerModules(appConfig: EcoPagesAppConfig, manifest: ProductionServerModulesManifest): void {
	const runtime = requireAppRuntime(appConfig);
	runtime.productionServerModules = manifest;
}

/**
 * Emits every production server entry into `outdir` and writes `server-modules.json`.
 *
 * @remarks
 * Imports the emitted Rolldown modules to discover extra `ssr: true` scripts, so
 * Integrations are activated first. An Integration that needs process globals
 * before those imports installs them in `setup()`.
 */
export async function emitProductionServerModules(options: {
	appConfig: EcoPagesAppConfig;
	router: ServerModuleEntryRouteSource;
	staticRoutes?: readonly StaticRoute[];
	errorPageLoaders?: ErrorPageLoaders;
	outdir?: string;
}): Promise<ProductionServerModulesManifest> {
	const appConfig = options.appConfig;
	requireAppRuntime(appConfig);
	await setupAppRuntimeIntegrations({ appConfig });
	const outdir = path.resolve(options.outdir ?? getServerBundleOutputPaths(appConfig).serverOutdir);
	fileSystem.ensureDir(outdir);

	const collected = await collectServerModuleEntries({
		appConfig,
		router: options.router,
		staticRoutes: options.staticRoutes,
		errorPageLoaders: options.errorPageLoaders,
	});

	let rolldownEntries = collected.filter((entryPath) => isRolldownServerModuleEntry(entryPath, appConfig));
	const htmlEntries = collected.filter((entryPath) => !isRolldownServerModuleEntry(entryPath, appConfig));

	const modules: Record<string, string> = {};
	const initialEmit = await emitRolldownServerModules(appConfig, uniqueEntryPaths(rolldownEntries), outdir);
	Object.assign(modules, initialEmit.modules);

	for (const htmlEntry of uniqueEntryPaths(htmlEntries)) {
		const emitted = await emitCompiledPageModule(appConfig, htmlEntry, outdir);
		modules[emitted.sourceKey] = emitted.relativePath;
	}

	let manifest: ProductionServerModulesManifest = {
		outdir,
		buildId: ensureProductionBuildId(appConfig),
		modules,
	};
	assignProductionServerModules(appConfig, manifest);

	const discoveredScripts = collectSsrScriptPaths(
		await importEmittedModules(
			manifest,
			rolldownEntries.map((entryPath) => toRootRelativePath(appConfig.rootDir, entryPath)),
		),
	).filter(
		(scriptPath) =>
			fileSystem.exists(scriptPath) && !(toRootRelativePath(appConfig.rootDir, scriptPath) in modules),
	);

	if (discoveredScripts.length > 0) {
		const scriptsToEmit: string[] = [];
		for (const scriptPath of discoveredScripts) {
			const existingOutput = findEmittedModulePath(initialEmit.outputGraph, scriptPath);
			if (existingOutput) {
				modules[toRootRelativePath(appConfig.rootDir, scriptPath)] = path
					.relative(outdir, existingOutput)
					.split(path.sep)
					.join('/');
			} else {
				scriptsToEmit.push(scriptPath);
			}
		}
		if (scriptsToEmit.length > 0) {
			const emittedModules = await emitRolldownServerModules(
				appConfig,
				uniqueEntryPaths([...rolldownEntries, ...scriptsToEmit]),
				outdir,
			);
			Object.assign(modules, emittedModules.modules);
		}
		manifest = { outdir, buildId: ensureProductionBuildId(appConfig), modules };
		assignProductionServerModules(appConfig, manifest);
	}

	writeProductionServerModulesManifest(manifest);

	appLogger.debug(`Emitted ${Object.keys(modules).length} production server modules`);
	return manifest;
}

/**
 * Builds eligible server entries in one Rolldown invocation and records outputs.
 *
 * @remarks
 * Production emit writes `dist/.server/server-modules.json`. HTML Pages compile
 * through `compilePageModule` and join the same map.
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
