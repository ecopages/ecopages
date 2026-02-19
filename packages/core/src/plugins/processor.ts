import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '../build/build-types.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../internal-types';
import type { AssetDefinition } from '../services/asset-processing-service';
import { GENERATED_BASE_PATHS } from '../constants';

function resolveGeneratedPath(
	type: keyof typeof GENERATED_BASE_PATHS,
	options: { root: string; module: string; subPath?: string },
): string {
	const { root, module, subPath } = options;
	const parts = [root, GENERATED_BASE_PATHS[type], module, subPath].filter(Boolean);
	return path.join(...(parts as string[]));
}

export interface ProcessorWatchContext {
	path: string;
	bridge: IClientBridge;
}

export interface ProcessorWatchConfig {
	paths: string[];
	extensions?: string[];
	onCreate?: (ctx: ProcessorWatchContext) => Promise<void>;
	onChange?: (ctx: ProcessorWatchContext) => Promise<void>;
	onDelete?: (ctx: ProcessorWatchContext) => Promise<void>;
	onError?: (error: Error) => void;
}

export type ProcessorAssetKind = 'script' | 'stylesheet' | 'image';
export type ProcessorExtensionPattern = string;

export interface ProcessorAssetCapability {
	kind: ProcessorAssetKind;
	/**
	 * Supported patterns:
	 * - `*` (all extensions)
	 * - `.css` or `css`
	 * - `*.css`
	 * - `*.{css,scss,sass}`
	 *
	 * Pattern matching is case-insensitive and trims surrounding spaces,
	 * including grouped values (e.g. `*.{ CSS, ScSs }`).
	 */
	extensions?: ProcessorExtensionPattern[];
}

export interface ProcessorConfig<TOptions = Record<string, unknown>> {
	name: string;
	description?: string;
	options?: TOptions;
	watch?: ProcessorWatchConfig;
	capabilities?: ProcessorAssetCapability[];
}
export interface ProcessorContext {
	config: EcoPagesAppConfig;
	rootDir: string;
	srcDir: string;
	distDir: string;
	cache?: string;
}

/**
 * Interface for processor build plugins
 * This is used to pass plugins to the build process directly from the processor
 * For instance it can become very handy when dealing with virtual modules that needs to be recognized by the bundler
 * i.e. @ecopages/image-processor
 */
export abstract class Processor<TOptions = Record<string, unknown>> {
	readonly name: string;
	protected dependencies: AssetDefinition[] = [];
	protected context?: ProcessorContext;
	protected options?: TOptions;
	protected watchConfig?: ProcessorWatchConfig;
	protected capabilities: ProcessorAssetCapability[] = [];

	/** Plugins that are only used during the build process */
	abstract buildPlugins?: EcoBuildPlugin[];

	/** Plugins that are used during runtime for file processing */
	abstract plugins?: EcoBuildPlugin[];

	constructor(config: ProcessorConfig<TOptions>) {
		this.name = config.name;
		this.options = config.options;
		this.watchConfig = config.watch;
		this.capabilities = config.capabilities ?? [];
	}

	setContext(appConfig: EcoPagesAppConfig): void {
		const cachePath = resolveGeneratedPath('cache', {
			root: appConfig.absolutePaths.distDir,
			module: this.name,
		});

		fileSystem.ensureDir(cachePath);

		this.context = {
			config: appConfig,
			rootDir: appConfig.rootDir,
			srcDir: appConfig.absolutePaths.srcDir,
			distDir: appConfig.absolutePaths.distDir,
			cache: cachePath,
		};
	}

	abstract setup(): Promise<void>;
	abstract teardown(): Promise<void>;
	abstract process(input: unknown, filePath?: string): Promise<unknown>;

	protected getCachePath(key: string): string {
		return `${this.context?.cache}/${key}`;
	}

	protected async readCache<T>(key: string): Promise<T | null> {
		const cachePath = this.getCachePath(key);
		try {
			const data = await fileSystem.readFile(cachePath);
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}

	protected async writeCache<T>(key: string, data: T): Promise<void> {
		if (!this.context?.cache) {
			throw new Error('Cache directory not set in context');
		}

		const cachePath = this.getCachePath(key);
		fileSystem.write(cachePath, JSON.stringify(data, null, 2));
	}

	getWatchConfig(): ProcessorWatchConfig | undefined {
		return this.watchConfig;
	}

	getDependencies(): AssetDefinition[] {
		return this.dependencies;
	}

	getName(): string {
		return this.name;
	}

	getAssetCapabilities(): ProcessorAssetCapability[] {
		return this.capabilities;
	}

	matchesFileFilter(_filepath: string): boolean {
		return true;
	}

	canProcessAsset(kind: ProcessorAssetKind, filepath?: string): boolean {
		const capabilities = this.getAssetCapabilities();
		if (capabilities.length === 0) {
			return false;
		}

		const matchingKind = capabilities.filter((capability) => capability.kind === kind);
		if (matchingKind.length === 0) {
			return false;
		}

		if (!filepath) {
			return true;
		}

		return matchingKind.some((capability) => this.matchesCapabilityExtensions(filepath, capability.extensions));
	}

	private matchesCapabilityExtensions(filepath: string, extensions?: ProcessorExtensionPattern[]): boolean {
		if (!extensions || extensions.length === 0) {
			return true;
		}

		const normalizedExt = path.extname(filepath).toLowerCase();

		return extensions.some((rawPattern) => {
			const pattern = this.normalizeExtensionPattern(rawPattern);
			if (!pattern) {
				return false;
			}

			if (pattern === '*') {
				return true;
			}

			const groupedMatch = pattern.match(/^\*\.\{(.+)\}$/);
			if (groupedMatch) {
				const groupItems = groupedMatch[1]
					.split(',')
					.map((item) => this.normalizeExtensionPattern(item))
					.filter(Boolean);

				return groupItems.some((item) => normalizedExt === item || normalizedExt === `.${item}`);
			}

			if (pattern.startsWith('*')) {
				const suffix = pattern.slice(1);
				return normalizedExt.endsWith(suffix);
			}

			if (pattern.startsWith('.')) {
				return normalizedExt === pattern;
			}

			return normalizedExt === `.${pattern}`;
		});
	}

	private normalizeExtensionPattern(rawPattern: string): string {
		return rawPattern.trim().toLowerCase();
	}
}
