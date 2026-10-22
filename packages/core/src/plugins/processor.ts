import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../config/internal-types.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../constants.ts';
import { GENERATED_BASE_PATHS } from '../constants.ts';
import { deepMerge } from '../utils/deep-merge.ts';

export type {
	EcoBuildLoader,
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildImportKind,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from '../build/contracts/build-types.ts';

export const PROCESSOR_ERRORS = {
	CACHE_DIRECTORY_NOT_SET: 'Cache directory not set in context',
} as const;

export function mergeProcessorOptions<TDefaults, TOverrides>(
	defaults: TDefaults,
	overrides: TOverrides,
): TDefaults & TOverrides {
	return deepMerge(defaults, overrides);
}

export function resolveGeneratedPath(
	type: keyof typeof GENERATED_BASE_PATHS,
	options: { root: string; module: string; subPath?: string },
): string {
	const { root, module, subPath } = options;
	const parts = [root, GENERATED_BASE_PATHS[type], module, subPath].filter(Boolean);
	return path.join(...(parts as string[]));
}

/**
 * Serializes the TypeScript `@types` package manifest for generated virtual-module declarations.
 */
export function serializeGeneratedTypesPackage(packageName: string): string {
	return `${JSON.stringify(
		{
			name: packageName,
			version: '0.0.0',
			types: './index.d.ts',
		},
		null,
		2,
	)}\n`;
}

/**
 * Writes the generated `@types` package manifest that TypeScript auto-loads from `node_modules`.
 */
export function writeGeneratedTypesPackage(options: {
	root: string;
	module: string;
	packageName: string;
	writeFile: (filePath: string, content: string) => void;
}): void {
	const packageManifestPath = resolveGeneratedPath('types', {
		root: options.root,
		module: options.module,
		subPath: 'package.json',
	});
	options.writeFile(packageManifestPath, serializeGeneratedTypesPackage(options.packageName));
}

/**
 * One debounce window of file changes, passed to {@link ProcessorWatchConfig.onChanges}.
 *
 * @remarks
 * Paths are absolute and already filtered by the Processor's watch `extensions`. A path appears in one
 * array only, by its last event in the window.
 */
export interface ProcessorWatchChanges {
	created: string[];
	changed: string[];
	deleted: string[];
	bridge: IClientBridge;
}

export interface ProcessorWatchConfig {
	paths: string[];
	/**
	 * File extensions that select paths passed to `onChanges`.
	 *
	 * @remarks
	 * Watch extensions drive notifications only. They do not declare asset ownership.
	 * Ownership requires {@link ProcessorConfig.capabilities} and controls whether dev
	 * invalidation skips server modules and HMR for processor-handled assets.
	 */
	extensions?: string[];
	/**
	 * Called once per debounce window, after core has invalidated what the changes affect.
	 *
	 * @remarks
	 * Never called when no path matches `extensions`. A rejection is logged with its stack; the other
	 * Processors and the browser update for the window still run.
	 */
	onChanges?: (changes: ProcessorWatchChanges) => Promise<void>;
	onError?: (error: Error) => void;
}

export type ProcessorAssetKind = 'script' | 'stylesheet' | 'image';
export type ProcessorExtensionPattern = string;

export interface ProcessorAssetCapability {
	kind: ProcessorAssetKind;
	/** Optional filename filter applied in addition to the declared extension patterns. */
	filter?: RegExp;
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

export interface ProcessorConfig<TOptions = unknown> {
	name: string;
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
 * Unconstrained processor type for heterogeneous processor collections.
 */
export type AnyProcessor = Processor<unknown>;

/**
 * Base class for content and asset processors that contribute build plugins.
 *
 * @remarks
 * Processors and Integrations declare build plugins through `plugins(app)`.
 * Each plugin selects its environments; omitting them applies to both.
 */
export abstract class Processor<TOptions = unknown> {
	readonly name: string;
	protected context?: ProcessorContext;
	protected options?: TOptions;
	protected watchConfig?: ProcessorWatchConfig;
	protected capabilities: ProcessorAssetCapability[] = [];

	/**
	 * Declares the build plugins this Processor contributes.
	 *
	 * @remarks
	 * Core reads it once, during config finalization, and it is the only plugin method finalization calls. It must
	 * not do I/O or start work: generation, config loading and cache restoring belong in {@link setup}, or in the
	 * plugin's own callbacks when a build can run before it. Browser-only plugins declare
	 * `environments: ['browser']`.
	 *
	 * @param app - The app config being finalized.
	 */
	plugins(_app: EcoPagesAppConfig): EcoBuildPlugin[] {
		return [];
	}

	constructor(config: ProcessorConfig<TOptions>) {
		this.name = config.name;
		this.options = config.options;
		this.watchConfig = config.watch;
		this.capabilities = (config.capabilities ?? []).map((capability) => ({
			...capability,
			...(capability.filter
				? { filter: new RegExp(capability.filter.source, capability.filter.flags.replace(/[gy]/gu, '')) }
				: {}),
		}));
	}

	setContext(appConfig: EcoPagesAppConfig): void {
		const workDir =
			appConfig.absolutePaths.workDir ??
			path.join(appConfig.rootDir, appConfig.workDir ?? DEFAULT_ECOPAGES_WORK_DIR);
		const cachePath = resolveGeneratedPath('cache', {
			root: workDir,
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

	/**
	 * Transforms one stylesheet before core writes or inlines it.
	 *
	 * @remarks
	 * Core calls it for every `.css`, `.scss`, `.sass` and `.less` asset, from file and content dependencies alike,
	 * when the Processor declares a `stylesheet` capability matching the file. Processors run in registration order,
	 * each receiving the previous result. A Processor without this method
	 * takes no part in stylesheet processing.
	 *
	 * @param css - Stylesheet source, or the previous Processor's output.
	 * @param file - Absolute path of the stylesheet, or the `processingOrigin` of a content dependency.
	 */
	transformStylesheet?(css: string, file: string): Promise<string>;

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
			throw new Error(PROCESSOR_ERRORS.CACHE_DIRECTORY_NOT_SET);
		}

		const cachePath = this.getCachePath(key);
		fileSystem.write(cachePath, JSON.stringify(data, null, 2));
	}

	getWatchConfig(): ProcessorWatchConfig | undefined {
		return this.watchConfig;
	}

	getName(): string {
		return this.name;
	}

	getAssetCapabilities(): ProcessorAssetCapability[] {
		return this.capabilities;
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

		return matchingKind.some(
			(capability) =>
				(!capability.filter || capability.filter.test(filepath)) &&
				this.matchesCapabilityExtensions(filepath, capability.extensions),
		);
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
