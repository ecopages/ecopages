import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { getAppBuildExecutor, getTranspileOptions } from '../../build/build-adapter.ts';
import type { DefaultHmrContext, EcoPagesAppConfig, IHmrManager, IClientBridge } from '../../internal-types.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrStrategy } from '../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../hmr/strategies/js-hmr-strategy.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { ClientBridgeEvent } from '../../public-types.ts';
import { HmrEntrypointRegistrar } from '../shared/hmr-entrypoint-registrar.ts';

export interface NodeHmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
}

type HandleFileChangeOptions = {
	broadcast?: boolean;
};

/**
 * Node development HMR manager.
 *
 * @remarks
 * This manager owns three separate concerns:
 * - runtime websocket event fanout
 * - entrypoint registration and dedupe
 * - strategy coordination for rebuilds and invalidation
 *
 * The strict page-entrypoint contract lives here: `registerEntrypoint()` is
 * reserved for integration-owned page bundles, while generic script assets must
 * go through `registerScriptEntrypoint()`.
 */
export class NodeHmrManager implements IHmrManager {
	private static readonly entrypointRegistrationTimeoutMs = 4000;
	public readonly appConfig: EcoPagesAppConfig;
	private readonly bridge: IClientBridge;
	private watchers = new Map<string, fs.FSWatcher>();
	private watchedFiles = new Map<string, string>();
	private entrypointRegistrations = new Map<string, Promise<string>>();
	private specifierMap = new Map<string, string>();
	/**
	 * Node-only reverse invalidation index: dependency file -> affected entrypoints.
	 */
	private dependencyEntrypoints = new Map<string, Set<string>>();
	/**
	 * Node-only forward index: entrypoint -> latest dependency set.
	 */
	private entrypointDependencies = new Map<string, Set<string>>();
	private distDir: string;
	private plugins: EcoBuildPlugin[] = [];
	private enabled = true;
	private strategies: HmrStrategy[] = [];
	private readonly entrypointRegistrar: HmrEntrypointRegistrar;

	constructor({ appConfig, bridge }: NodeHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.distDir = path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR, '_hmr');
		this.entrypointRegistrar = new HmrEntrypointRegistrar({
			srcDir: this.appConfig.absolutePaths.srcDir,
			distDir: this.distDir,
			entrypointRegistrations: this.entrypointRegistrations,
			watchedFiles: this.watchedFiles,
			clearFailedRegistration: (entrypointPath) => this.clearFailedEntrypointRegistration(entrypointPath),
			registrationTimeoutMs: NodeHmrManager.entrypointRegistrationTimeoutMs,
		});
		this.cleanDistDir();
		this.initializeStrategies();
	}

	/**
	 * Ensures the HMR output directory exists.
	 *
	 * This must not remove the directory because multiple app processes
	 * can share the same dist path during e2e runs.
	 */
	private cleanDistDir(): void {
		fileSystem.ensureDir(this.distDir);
	}

	/**
	 * Returns whether the generic JS strategy is allowed to rebuild an entrypoint.
	 *
	 * @remarks
	 * Higher-priority integration strategies own framework page entrypoints. When
	 * one of them matches, the generic JS strategy must stay out of the way so a
	 * shared dependency invalidation does not overwrite framework-specific output.
	 */
	private shouldJsStrategyProcessEntrypoint(entrypointPath: string): boolean {
		return !this.strategies.some((strategy) => {
			if (strategy.type !== HmrStrategyType.INTEGRATION || strategy.priority <= HmrStrategyType.SCRIPT) {
				return false;
			}

			try {
				return strategy.matches(entrypointPath);
			} catch (error) {
				appLogger.error(error);
				return false;
			}
		});
	}

	private initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.specifierMap,
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getBuildExecutor: () => getAppBuildExecutor(this.appConfig),
			getDependencyEntrypoints: (filePath: string) =>
				new Set(this.dependencyEntrypoints.get(path.resolve(filePath)) ?? []),
			setEntrypointDependencies: (entrypointPath: string, dependencies: string[]) =>
				this.setEntrypointDependencies(entrypointPath, dependencies),
			shouldProcessEntrypoint: (entrypointPath: string) => this.shouldJsStrategyProcessEntrypoint(entrypointPath),
		};

		this.strategies = [new JsHmrStrategy(jsContext), new DefaultHmrStrategy()];
	}

	public registerStrategy(strategy: HmrStrategy): void {
		this.strategies.push(strategy);
	}

	public setPlugins(plugins: EcoBuildPlugin[]): void {
		this.plugins = [...plugins];
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Registers runtime bare-specifier mappings exposed by integrations.
	 *
	 * @remarks
	 * These mappings are consumed by framework-owned HMR strategies such as the
	 * React integration strategy when they rewrite browser bundles.
	 */
	public registerSpecifierMap(map: Record<string, string>): void {
		for (const [specifier, url] of Object.entries(map)) {
			this.specifierMap.set(specifier, url);
		}
	}

	public async buildRuntime(): Promise<void> {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const runtimeSource = path.resolve(currentDir, '../../hmr/client/hmr-runtime.ts');
		const buildExecutor = getAppBuildExecutor(this.appConfig);

		const result = await buildExecutor.build({
			entrypoints: [runtimeSource],
			outdir: this.distDir,
			naming: '_hmr_runtime.js',
			minify: false,
			...getTranspileOptions('hmr-runtime'),
			plugins: this.plugins,
		});

		if (!result.success) {
			appLogger.error('[HMR] Failed to build runtime script:', result.logs);
		}
	}

	public getRuntimePath(): string {
		return path.join(this.distDir, '_hmr_runtime.js');
	}

	public broadcast(event: ClientBridgeEvent) {
		appLogger.debug(
			`[HMR] Broadcasting ${event.type} event, path=${event.path || 'all'}, subscribers=${this.bridge.subscriberCount}`,
		);
		this.bridge.broadcast(event);
	}

	public async handleFileChange(filePath: string, options: HandleFileChangeOptions = {}): Promise<void> {
		const sorted = [...this.strategies].sort((a, b) => b.priority - a.priority);
		const strategy = sorted.find((s) => {
			try {
				return s.matches(filePath);
			} catch (err) {
				appLogger.error(err);
				return false;
			}
		});

		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			return;
		}

		appLogger.debug(`[NodeHmrManager] Selected strategy: ${strategy.constructor.name}`);

		const action = await strategy.process(filePath);
		const shouldBroadcast = options.broadcast ?? true;

		if (shouldBroadcast && action.type === 'broadcast') {
			if (action.events) {
				for (const event of action.events) {
					this.broadcast(event);
				}
			}
		}
	}

	public getOutputUrl(entrypointPath: string): string | undefined {
		return this.watchedFiles.get(entrypointPath);
	}

	public getWatchedFiles(): Map<string, string> {
		return this.watchedFiles;
	}

	public getSpecifierMap(): Map<string, string> {
		return this.specifierMap;
	}

	public getDistDir(): string {
		return this.distDir;
	}

	public getPlugins(): EcoBuildPlugin[] {
		return this.plugins;
	}

	public getDefaultContext(): DefaultHmrContext {
		return {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.specifierMap,
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getBuildExecutor: () => getAppBuildExecutor(this.appConfig),
		};
	}

	/**
	 * Updates Node HMR dependency indexes for selective invalidation.
	 *
	 * @remarks
	 * Graph data comes from Node/esbuild build metadata and does not affect Bun
	 * HMR behavior.
	 */
	private setEntrypointDependencies(entrypointPath: string, dependencies: string[]): void {
		const normalizedEntrypoint = path.resolve(entrypointPath);

		this.clearEntrypointDependencies(normalizedEntrypoint);

		const normalizedDependencies = new Set<string>([
			normalizedEntrypoint,
			...dependencies.map((dependencyPath) => path.resolve(dependencyPath)),
		]);

		this.entrypointDependencies.set(normalizedEntrypoint, normalizedDependencies);

		for (const dependencyPath of normalizedDependencies) {
			const entrypoints = this.dependencyEntrypoints.get(dependencyPath) ?? new Set<string>();
			entrypoints.add(normalizedEntrypoint);
			this.dependencyEntrypoints.set(dependencyPath, entrypoints);
		}
	}

	private clearEntrypointDependencies(entrypointPath: string): void {
		const previousDependencies = this.entrypointDependencies.get(entrypointPath);

		if (!previousDependencies) {
			return;
		}

		for (const dependencyPath of previousDependencies) {
			const entrypoints = this.dependencyEntrypoints.get(dependencyPath);
			if (!entrypoints) {
				continue;
			}

			entrypoints.delete(entrypointPath);
			if (entrypoints.size === 0) {
				this.dependencyEntrypoints.delete(dependencyPath);
			}
		}

		this.entrypointDependencies.delete(entrypointPath);
	}

	private clearFailedEntrypointRegistration(entrypointPath: string): void {
		this.watchedFiles.delete(entrypointPath);
		this.clearEntrypointDependencies(entrypointPath);
	}

	/**
	 * Registers one integration-owned page entrypoint.
	 *
	 * @remarks
	 * Concurrent callers share one in-flight registration. The registration is
	 * removed from the dedupe map once it resolves or fails so later requests do
	 * not inherit stale state.
	 */
	public async registerEntrypoint(entrypointPath: string): Promise<string> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitStrictEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint, outputPath) =>
				new Error(
					`[HMR] Integration failed to emit entrypoint ${normalizedEntrypoint} to ${outputPath}. Page entrypoints must be produced by their owning integration.`,
				),
		});
	}

	/**
	 * Registers one generic script entrypoint.
	 *
	 * @remarks
	 * This path is intentionally separate from page entrypoints so non-framework
	 * scripts can still use the generic build fallback without weakening the page
	 * ownership contract.
	 */
	public async registerScriptEntrypoint(entrypointPath: string): Promise<string> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitScriptEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint) =>
				new Error(`[HMR] Failed to register script entrypoint: ${normalizedEntrypoint}`),
		});
	}

	/**
	 * Performs strict integration-owned entrypoint registration for one normalized source path.
	 *
	 * @remarks
	 * The flow is:
	 * 1. Reserve the output URL in the watched map.
	 * 2. Remove any stale emitted file from an earlier process or failed build.
	 * 3. Let the strategy chain try to emit the entrypoint without broadcasting.
	 * 4. Fail if the owning integration did not emit the expected output.
	 */
	private async emitStrictEntrypoint(entrypointPath: string, _outputPath: string): Promise<void> {
		await this.handleFileChange(entrypointPath, { broadcast: false });
	}

	/**
	 * Performs registration for a generic script asset.
	 *
	 * @remarks
	 * The manager first gives registered strategies a chance to emit the file so
	 * processor-owned or integration-owned behavior can still participate. Only
	 * when no output exists does it issue the generic build.
	 */
	private async emitScriptEntrypoint(entrypointPath: string, outputPath: string): Promise<void> {
		const naming = path.relative(this.distDir, outputPath).split(path.sep).join('/');
		const buildExecutor = getAppBuildExecutor(this.appConfig);

		await this.handleFileChange(entrypointPath, { broadcast: false });

		if (!fileSystem.exists(outputPath)) {
			const buildResult = await buildExecutor.build({
				entrypoints: [entrypointPath],
				outdir: this.distDir,
				naming,
				minify: false,
				...getTranspileOptions('hmr-entrypoint'),
				plugins: this.plugins,
			});

			if (!buildResult.success) {
				appLogger.error(
					`[HMR] Generic script entrypoint build failed for ${entrypointPath}:`,
					buildResult.logs,
				);
			}
		}
	}

	/**
	 * Stops active watchers and releases retained registration state.
	 *
	 * @remarks
	 * The manager intentionally does not remove emitted `_hmr` files from disk
	 * because multiple app processes may share the same dist directory during test
	 * runs. It does clear in-memory indexes so old entrypoints, dependencies, and
	 * specifier maps cannot leak across a reused manager instance.
	 */
	public stop() {
		this.entrypointRegistrations.clear();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.watchedFiles.clear();
		this.specifierMap.clear();
		this.dependencyEntrypoints.clear();
		this.entrypointDependencies.clear();
		this.plugins = [];
	}
}
