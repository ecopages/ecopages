import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { defaultBuildAdapter } from '../../build/build-adapter.ts';
import type { DefaultHmrContext, EcoPagesAppConfig, IHmrManager, IClientBridge } from '../../internal-types.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import type { HmrStrategy } from '../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../hmr/strategies/js-hmr-strategy.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { ClientBridgeEvent } from '../../public-types.ts';

export interface NodeHmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
}

export class NodeHmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	private readonly bridge: IClientBridge;
	private watchers = new Map<string, fs.FSWatcher>();
	private watchedFiles = new Map<string, string>();
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

	constructor({ appConfig, bridge }: NodeHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.distDir = path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR, '_hmr');
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

	private initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.specifierMap,
			getDependencyEntrypoints: (filePath: string) =>
				new Set(this.dependencyEntrypoints.get(path.resolve(filePath)) ?? []),
			setEntrypointDependencies: (entrypointPath: string, dependencies: string[]) =>
				this.setEntrypointDependencies(entrypointPath, dependencies),
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
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

	public registerSpecifierMap(map: Record<string, string>): void {
		for (const [specifier, url] of Object.entries(map)) {
			this.specifierMap.set(specifier, url);
		}
	}

	public async buildRuntime(): Promise<void> {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const runtimeSource = path.resolve(currentDir, '../../hmr/client/hmr-runtime.ts');

		const result = await defaultBuildAdapter.build({
			entrypoints: [runtimeSource],
			outdir: this.distDir,
			naming: '_hmr_runtime.js',
			minify: false,
			...defaultBuildAdapter.getTranspileOptions('hmr-runtime'),
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

	public async handleFileChange(filePath: string): Promise<void> {
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

		if (action.type === 'broadcast') {
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
		const previousDependencies = this.entrypointDependencies.get(normalizedEntrypoint);

		if (previousDependencies) {
			for (const dependencyPath of previousDependencies) {
				const entrypoints = this.dependencyEntrypoints.get(dependencyPath);
				if (!entrypoints) {
					continue;
				}

				entrypoints.delete(normalizedEntrypoint);
				if (entrypoints.size === 0) {
					this.dependencyEntrypoints.delete(dependencyPath);
				}
			}
		}

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

	public async registerEntrypoint(entrypointPath: string): Promise<string> {
		if (this.watchedFiles.has(entrypointPath)) {
			return this.watchedFiles.get(entrypointPath)!;
		}

		const srcDir = this.appConfig.absolutePaths.srcDir;
		const relativePath = path.relative(srcDir, entrypointPath);
		const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
		const encodedPathJs = this.encodeDynamicSegments(relativePathJs);

		const urlPath = encodedPathJs.split(path.sep).join('/');
		const outputUrl = `/${path.join(RESOLVED_ASSETS_DIR, '_hmr', urlPath)}`;
		const outputPath = path.join(this.distDir, urlPath);

		this.watchedFiles.set(entrypointPath, outputUrl);

		await this.handleFileChange(entrypointPath);

		if (!fileSystem.exists(outputPath)) {
			const fallback = await defaultBuildAdapter.build({
				entrypoints: [entrypointPath],
				outdir: this.distDir,
				naming: encodedPathJs,
				minify: false,
				external: Array.from(this.specifierMap.keys()),
				...defaultBuildAdapter.getTranspileOptions('hmr-entrypoint'),
				plugins: this.plugins,
			});

			if (!fallback.success) {
				appLogger.error(`[HMR] Fallback build failed for ${entrypointPath}:`, fallback.logs);
			}
		}

		return outputUrl;
	}

	private encodeDynamicSegments(filepath: string): string {
		return filepath.replace(/\[([^\]]+)\]/g, '_$1_');
	}

	public stop() {
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
	}
}
