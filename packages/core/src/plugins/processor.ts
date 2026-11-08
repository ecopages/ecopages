import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../config/internal-types.ts';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../constants.ts';
import { GENERATED_BASE_PATHS } from '../constants.ts';
import { contentHash } from '../utils/content-hash.ts';
import { deepMerge } from '../utils/deep-merge.ts';
import { extensionsOfPattern } from './stylesheet-kinds.ts';

export type {
	EcoBuildFilter,
	EcoBuildLoader,
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
	EcoBuildResolvedId,
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
 * Builds the ambient module declarations of the stylesheet extensions a Processor declares, for the Processor to write
 * into its generated `@types` package from `setup()`.
 *
 * @remarks
 * Core ships the declarations of `.css` and `.module.css` itself (`css-imports.d.ts`), so they are left out; the
 * result is empty when no stylesheet capability declares another extension. For each extension `*.<ext>` declares
 * the CSS string, and, when the capability sets `cssModules`, `*.module.<ext>` declares the class map. The module
 * pattern comes first because TypeScript takes the first of two patterns that match a specifier alike.
 */
export function serializeStylesheetModuleDeclarations(capabilities: readonly ProcessorAssetCapability[]): string {
	const declarations = new Map<string, boolean>();
	for (const capability of capabilities) {
		if (capability.kind !== 'stylesheet') continue;
		for (const extension of (capability.extensions ?? []).flatMap(extensionsOfPattern)) {
			if (extension === '.css') continue;
			declarations.set(extension, declarations.get(extension) === true || capability.cssModules === true);
		}
	}
	return [...declarations]
		.map(([extension, cssModules]) => {
			const classes = cssModules
				? `declare module '*.module${extension}' {\n\tconst classes: { readonly [key: string]: string };\n\texport default classes;\n}\n\n`
				: '';
			return `${classes}declare module '*${extension}' {\n\tconst styles: string;\n\texport default styles;\n}\n`;
		})
		.join('\n');
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
	/**
	 * Whether a `stylesheet` capability scopes CSS Modules.
	 *
	 * @remarks
	 * A Processor that sets it returns `exports` from {@link Processor.transformStylesheet} for every CSS Module it is
	 * given: a stylesheet named `*.module.css`, or `*.module.<ext>` for a declared extension. Without it, core fails
	 * a build that imports a CSS Module and names the Processor to install.
	 */
	cssModules?: boolean;
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
	/** Public output directory (`client/` beneath the configured build output root). */
	distDir: string;
	cache?: string;
}

/** What {@link Processor.transformStylesheet} returns for one stylesheet. */
export interface StylesheetTransformResult {
	css: string;
	/**
	 * The class map of a CSS Module: each local class name mapped to its scoped name, followed by the names it
	 * composes, separated by spaces.
	 *
	 * @remarks
	 * Required for a CSS Module when the Processor declares `cssModules`, and ignored for any other stylesheet. The
	 * scoped names must derive from the path relative to the app's `rootDir`, never from the absolute path, so a build
	 * gives the same names in any folder. Core serves the map as the module the importer receives and `css` as the
	 * stylesheet the Page links, both from this one result.
	 */
	exports?: Readonly<Record<string, string>>;
	/**
	 * Absolute paths of the other files the transform read, such as the partials an `@import` inlined.
	 *
	 * @remarks
	 * Take them from the transform itself (PostCSS `dependency` messages, Lightning CSS `dependencies`), never from a
	 * scan of the source. Core keeps the ones that are stylesheets and rebuilds the stylesheet, and every module that
	 * imports it, when one of them changes; a change to any other input reaches the stylesheet through
	 * {@link Processor.invalidateStylesheets}.
	 */
	dependencies?: readonly string[];
}

/** What {@link Processor.invalidateStylesheets} returns: the stylesheets to rebuild, or `'all'` for every entry. */
export type StylesheetInvalidation = 'all' | readonly string[];

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
	 * Source files this Processor needs in the production server-modules map.
	 *
	 * @remarks
	 * Core includes them in the unified graph after `setup()`. Production `ecopages start`
	 * imports the emitted modules and does not call `setup()`. Development never reads this list.
	 */
	listProductionServerModuleEntries(): string[] {
		return [];
	}

	/**
	 * Restores in-memory state from the production server-modules map.
	 *
	 * @remarks
	 * Called instead of `setup()` on production `ecopages start`, and in the Lit static-render
	 * worker. Must not scan sources or write under the work directory.
	 */
	restoreProductionRuntime(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Transforms one stylesheet before core writes or inlines it.
	 *
	 * @remarks
	 * Core calls it for each stylesheet the Processor's `stylesheet` capability matches, from file and content
	 * dependencies alike: a `.css` file, or a file with an extension the capability declares. At most one Processor
	 * in an app may declare a `stylesheet` capability: config finalization fails when two do. A Processor without
	 * this method takes no part in stylesheet processing.
	 *
	 * @param css - Stylesheet source.
	 * @param file - Absolute path of the stylesheet, or the `processingOrigin` of a content dependency.
	 */
	transformStylesheet?(css: string, file: string): Promise<StylesheetTransformResult>;

	/**
	 * Names the stylesheets a change to other files makes stale, such as the stylesheets Tailwind generates from the
	 * class names it scans in templates.
	 *
	 * @remarks
	 * In development core calls it once per watcher batch that changed a file that is not a stylesheet, with those
	 * absolute paths, before it rebuilds. `'all'` rebuilds every stylesheet no other stylesheet imports. The Processor
	 * may reset state here that would hide the change, as the PostCSS Processor recreates its plugins. A stylesheet
	 * whose own `@import` partials changed needs no hook: core rebuilds it from the transform's `dependencies`.
	 *
	 * @param files - The changed paths that are not stylesheets.
	 */
	invalidateStylesheets?(files: readonly string[]): StylesheetInvalidation | Promise<StylesheetInvalidation>;

	/**
	 * @remarks
	 * The file name is a digest of `key`, so a key may hold any character, including `:` and `/`,
	 * which some platforms reject in a file name.
	 */
	protected getCachePath(key: string): string {
		if (!this.context?.cache) {
			throw new Error(PROCESSOR_ERRORS.CACHE_DIRECTORY_NOT_SET);
		}

		return path.join(this.context.cache, `${contentHash(key)}.json`);
	}

	protected async readCache<T>(key: string): Promise<T | null> {
		try {
			const data = await fileSystem.readFile(this.getCachePath(key));
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}

	protected async writeCache<T>(key: string, data: T): Promise<void> {
		fileSystem.write(this.getCachePath(key), JSON.stringify(data, null, 2));
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
