import fs from 'node:fs';
import path from 'node:path';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { defaultBuildAdapter } from '../../build/build-adapter.ts';
import type { DefaultHmrContext, EcoPagesAppConfig, IHmrManager } from '../../internal-types';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import type { HmrStrategy } from '../../hmr/hmr-strategy';
import { DefaultHmrStrategy } from '../../hmr/strategies/default-hmr-strategy';
import { JsHmrStrategy } from '../../hmr/strategies/js-hmr-strategy';
import { appLogger } from '../../global/app-logger';
import type { ClientBridge } from './client-bridge';
import type { ClientBridgeEvent } from '../../public-types';

type BunSocket = ServerWebSocket<unknown>;
type BunSocketHandler = WebSocketHandler<unknown>;

export interface HmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: ClientBridge;
}

export class HmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	private readonly bridge: ClientBridge;
	/** Keep track of watchers */
	private watchers = new Map<string, fs.FSWatcher>();
	/** entrypoint -> output path */
	private watchedFiles = new Map<string, string>();
	/** bare specifier -> runtime URL (e.g., 'react' -> '/assets/vendors/react.js') */
	private specifierMap = new Map<string, string>();
	private distDir: string;
	private plugins: EcoBuildPlugin[] = [];
	private enabled = true;
	private strategies: HmrStrategy[] = [];
	private wsHandler!: {
		open: (ws: BunSocket) => void;
		close: (ws: BunSocket) => void;
	};

	constructor({ appConfig, bridge }: HmrManagerParams) {
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

	/**
	 * Initializes core HMR strategies.
	 * Strategies are evaluated in priority order (highest first).
	 */
	private initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.specifierMap,
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
		};

		this.strategies = [new JsHmrStrategy(jsContext), new DefaultHmrStrategy()];
	}

	/**
	 * Registers a custom HMR strategy.
	 * Used by integrations to provide framework-specific HMR handling.
	 * @param strategy - The HMR strategy to register
	 */
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
	 * Registers a mapping from bare specifiers to vendor URLs.
	 * Used by integrations to provide their module resolution mappings.
	 * @param map - Object mapping bare specifiers to vendor URLs
	 */
	public registerSpecifierMap(map: Record<string, string>): void {
		for (const [specifier, url] of Object.entries(map)) {
			this.specifierMap.set(specifier, url);
		}
	}

	public getWebSocketHandler(): BunSocketHandler {
		const open = (ws: BunSocket) => {
			this.bridge.subscribe(ws);
			appLogger.debug(`[HmrManager] Connection opened. Subscribers: ${this.bridge.subscriberCount}`);
		};

		const close = (ws: BunSocket) => {
			this.bridge.unsubscribe(ws);
			appLogger.debug(`[HmrManager] Connection closed. Subscribers: ${this.bridge.subscriberCount}`);
		};

		this.wsHandler = { open, close };

		return {
			open: this.wsHandler.open,
			close: this.wsHandler.close,
			message: (_ws, message) => {
				appLogger.debug('[HMR] Received message from client:', message);
			},
		};
	}

	/**
	 * Builds the client-side HMR runtime script.
	 */
	public async buildRuntime(): Promise<void> {
		const runtimeSource = path.resolve(import.meta.dirname, '../../hmr/client/hmr-runtime.ts');

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

	/**
	 * Handles file changes using registered HMR strategies.
	 * Strategies are evaluated in priority order until one matches.
	 * @param filePath - Absolute path to the changed file
	 */
	public async handleFileChange(filePath: string): Promise<void> {
		const sorted = [...this.strategies].sort((a, b) => b.priority - a.priority);
		const strategy = sorted.find((s) => {
			try {
				return s.matches(filePath);
			} catch (err) {
				appLogger.error(`[HmrManager] Error checking match for ${s.constructor.name}:`, err as Error);
				return false;
			}
		});

		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			return;
		}

		appLogger.debug(`[HmrManager] Selected strategy: ${strategy.constructor.name}`);

		const action = await strategy.process(filePath);

		if (action.type === 'broadcast') {
			if (action.events) {
				for (const event of action.events) {
					this.broadcast(event);
				}
			}
		}
	}

	/**
	 * Registers a client entrypoint to be built and watched by Bun.
	 */
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

	/**
	 * Encodes dynamic route segments (brackets) in file paths.
	 * Converts `[slug]` to `_slug_` to avoid filesystem/URL issues.
	 */
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
