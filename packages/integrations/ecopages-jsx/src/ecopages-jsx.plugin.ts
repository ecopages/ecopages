import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { CompileOptions } from '@mdx-js/mdx';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { AssetFactory, type ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { JsxRenderable } from '@ecopages/jsx';
import { VFile } from 'vfile';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import { EcopagesJsxRenderer } from './ecopages-jsx-renderer.ts';
import type {
	EcopagesJsxMdxCompileOptions,
	EcopagesJsxMdxOptions,
	EcopagesJsxPluginOptions,
	EcopagesJsxRendererConfig,
} from './ecopages-jsx.types.ts';
import { JsxRuntimeBundleService } from './services/jsx-runtime-bundle.service.ts';

export type {
	EcopagesJsxMdxCompileOptions,
	EcopagesJsxMdxOptions,
	EcopagesJsxPluginOptions,
	EcopagesJsxRendererConfig,
} from './ecopages-jsx.types.ts';

type ResolvedMdxCompileOptions = EcopagesJsxMdxCompileOptions & Pick<CompileOptions, 'jsxImportSource' | 'jsxRuntime'>;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mergePluginLists = <T>(...lists: Array<readonly T[] | null | undefined>): T[] | undefined => {
	const merged = lists.flatMap((list) => (list ? [...list] : []));
	return merged.length > 0 ? merged : undefined;
};

const createMdxExtensionFilter = (extensions: string[], options?: { allowQueryString?: boolean }): RegExp => {
	const escaped = extensions.map(escapeRegex);
	const suffix = options?.allowQueryString ? '(\\?.*)?$' : '$';
	return new RegExp(`(${escaped.join('|')})${suffix}`);
};

const appendMdxExtensions = (target: string[], mdxExtensions: string[]): void => {
	for (const ext of mdxExtensions) {
		if (!target.includes(ext)) {
			target.push(ext);
		}
	}
};

/**
 * Resolves MDX compiler options for the JSX integration.
 *
 * The integration always controls the JSX runtime fields so route compilation
 * stays aligned with the shared `@ecopages/jsx` server and client runtime.
 */
const resolveMdxCompilerOptions = (mdxOptions: EcopagesJsxMdxOptions): ResolvedMdxCompileOptions => {
	const { compilerOptions, remarkPlugins, rehypePlugins, recmaPlugins } = mdxOptions;
	const resolved: ResolvedMdxCompileOptions = {
		format: 'detect',
		outputFormat: 'program',
		...compilerOptions,
		jsxImportSource: '@ecopages/jsx',
		jsxRuntime: 'automatic',
		development: process.env.NODE_ENV === 'development',
	};

	const mergedRemark = mergePluginLists(compilerOptions?.remarkPlugins, remarkPlugins);
	const mergedRehype = mergePluginLists(compilerOptions?.rehypePlugins, rehypePlugins);
	const mergedRecma = mergePluginLists(compilerOptions?.recmaPlugins, recmaPlugins);

	if (mergedRemark) resolved.remarkPlugins = mergedRemark;
	if (mergedRehype) resolved.rehypePlugins = mergedRehype;
	if (mergedRecma) resolved.recmaPlugins = mergedRecma;

	return resolved;
};

const createMdxLoaderPlugin = (compilerOptions: ResolvedMdxCompileOptions, extensions: string[]): EcoBuildPlugin => {
	const filter = createMdxExtensionFilter(extensions, { allowQueryString: true });

	return {
		name: 'ecopages-jsx-mdx-loader',
		setup(build) {
			build.onLoad({ filter }, async (args) => {
				const { compile } = await import('@mdx-js/mdx');
				const filePath = args.path.includes('?') ? args.path.split('?')[0] : args.path;
				const source = await readFile(filePath, 'utf-8');
				const compiled = await compile(new VFile({ value: source, path: filePath }), compilerOptions);

				return {
					contents: String(compiled.value),
					loader: 'js',
					resolveDir: path.dirname(filePath),
				};
			});
		},
	};
};

type ResolvedJsxPluginConfig = Omit<IntegrationPluginConfig, 'name' | 'extensions' | 'jsxImportSource'> & {
	extensions: string[];
	includeRadiant: boolean;
	mdxEnabled: boolean;
	mdxExtensions: string[];
	mdxCompilerOptions?: ResolvedMdxCompileOptions;
};

/**
 * Resolves user-facing plugin options into a fully-defaulted internal config.
 *
 * Defaults:
 * - `extensions`: `['.tsx']`
 * - `radiant`: `true`
 * - `mdx.enabled`: `false`
 * - `mdx.extensions`: `['.mdx']`
 */
const resolvePluginOptions = (options?: EcopagesJsxPluginOptions): ResolvedJsxPluginConfig => {
	const { extensions: userExtensions, radiant, mdx, ...baseConfig } = options ?? {};

	const extensions = [...(userExtensions ?? ['.tsx'])];
	const mdxExtensions = mdx?.extensions ?? ['.mdx'];
	const mdxEnabled = mdx?.enabled ?? false;

	if (mdxEnabled) {
		appendMdxExtensions(extensions, mdxExtensions);
	}

	return {
		...baseConfig,
		extensions,
		includeRadiant: radiant ?? true,
		mdxEnabled,
		mdxExtensions,
		mdxCompilerOptions: mdxEnabled && mdx ? resolveMdxCompilerOptions(mdx) : undefined,
	};
};

/** JSX integration plugin for Ecopages, supporting `.tsx` templates and optional Radiant web components. */
export class EcopagesJsxPlugin extends IntegrationPlugin<JsxRenderable> {
	renderer = EcopagesJsxRenderer;

	private customElementAssets = new Map<string, readonly ProcessedAsset[]>();
	private includeRadiant: boolean;
	private mdxEnabled: boolean;
	private mdxCompilerOptions?: ResolvedMdxCompileOptions;
	private mdxExtensions: string[];
	private mdxLoaderPlugin?: EcoBuildPlugin;
	private runtimeBundleService: JsxRuntimeBundleService;
	private runtimeSpecifierMap: Record<string, string> = {};
	private runtimeDepsInitialized = false;

	/** Returns the build plugins required by the JSX integration. */
	override get plugins(): EcoBuildPlugin[] {
		return [this.mdxLoaderPlugin].filter((plugin): plugin is EcoBuildPlugin => plugin !== undefined);
	}

	/** Returns the browser-only build plugins required by the JSX integration. */
	override get browserBuildPlugins(): EcoBuildPlugin[] {
		return [this.runtimeBundleService.getBuildPlugin()];
	}

	/**
	 * Exposes the bare-module specifier map used by the import map.
	 *
	 * Client bundles keep these imports external so the browser can load the
	 * shared runtime packages from the generated vendor assets.
	 */
	override getRuntimeSpecifierMap(): Record<string, string> {
		return this.runtimeSpecifierMap;
	}

	/**
	 * Creates the renderer instance and attaches the discovered intrinsic custom
	 * element assets before the renderer handles any requests.
	 */
	override initializeRenderer(options?: { rendererModules?: unknown }): EcopagesJsxRenderer {
		const rendererConfig: EcopagesJsxRendererConfig = {
			intrinsicCustomElementAssets: this.customElementAssets,
			mdxExtensions: this.mdxExtensions,
			radiantSsrEnabled: this.includeRadiant,
		};
		const renderer = new this.renderer({
			...this.createRendererOptions(options),
			jsxConfig: rendererConfig,
		});
		return this.attachRendererRuntimeServices(renderer);
	}

	constructor(options?: EcopagesJsxPluginOptions) {
		const config = resolvePluginOptions(options);
		const { extensions, includeRadiant, mdxEnabled, mdxExtensions, mdxCompilerOptions, ...baseConfig } = config;

		super({
			name: ECOPAGES_JSX_PLUGIN_NAME,
			extensions,
			jsxImportSource: '@ecopages/jsx',
			...baseConfig,
		});

		this.includeRadiant = includeRadiant;
		this.runtimeBundleService = new JsxRuntimeBundleService({ radiant: includeRadiant });
		this.mdxEnabled = mdxEnabled;
		this.mdxExtensions = mdxExtensions;
		this.mdxCompilerOptions = mdxCompilerOptions;
	}

	/** Ensures MDX build hooks are ready before Ecopages collects contributions. */
	override async prepareBuildContributions(): Promise<void> {
		if (!this.runtimeDepsInitialized) {
			this.runtimeDepsInitialized = true;
			this.runtimeBundleService.setRootDir(this.appConfig?.rootDir);
			this.runtimeSpecifierMap = await this.runtimeBundleService.getSpecifierMap();
			const vendorDeps = await this.runtimeBundleService.getDependencies();
			this.integrationDependencies.unshift(...vendorDeps);
		}

		this.ensureMdxLoaderPlugin();
	}

	/**
	 * Registers MDX tooling, discovers intrinsic custom-element assets, and then
	 * completes the base integration setup.
	 */
	override async setup(): Promise<void> {
		this.ensureMdxLoaderPlugin();

		if (typeof Bun !== 'undefined' && this.mdxEnabled && this.mdxCompilerOptions) {
			await this.registerMdxBunPlugin();
		}

		await this.buildCustomElementRegistry();

		await super.setup();
	}

	private ensureMdxLoaderPlugin(): void {
		if (!this.mdxEnabled || !this.mdxCompilerOptions || this.mdxLoaderPlugin) {
			return;
		}

		this.mdxLoaderPlugin = createMdxLoaderPlugin(this.mdxCompilerOptions, this.mdxExtensions);
	}

	/**
	 * Registers Bun's MDX loader at runtime setup time.
	 *
	 * Build-time contribution collection may run where Bun is absent, so
	 * this hook stays isolated from manifest preparation.
	 */
	private async registerMdxBunPlugin(): Promise<void> {
		if (typeof Bun === 'undefined' || !this.mdxCompilerOptions) {
			return;
		}

		const compilerOptions = this.mdxCompilerOptions;
		const filter = createMdxExtensionFilter(this.mdxExtensions);

		Bun.plugin({
			name: 'ecopages-jsx-mdx',
			setup(build) {
				build.onLoad({ filter }, async (args) => {
					const { compile } = await import('@mdx-js/mdx');
					const source = await readFile(args.path, 'utf-8');
					const compiled = await compile(new VFile({ value: source, path: args.path }), compilerOptions);

					return { contents: String(compiled.value), loader: 'js' as const };
				});
			},
		});
	}

	/**
	 * Scans `src/` for custom-element entry scripts and pre-resolves their assets.
	 *
	 * The renderer's server-side custom-element hook relies on this registry to
	 * attach browser scripts without per-render file-system lookups.
	 */
	private async buildCustomElementRegistry(): Promise<void> {
		if (!this.appConfig || !this.assetProcessingService) {
			return;
		}

		this.customElementAssets.clear();
		const scriptFiles = await this.collectScriptEntries(this.appConfig.absolutePaths.srcDir);

		for (const scriptFile of scriptFiles) {
			const tagNames = await this.extractCustomElementTagNames(scriptFile);

			if (tagNames.length === 0) {
				continue;
			}

			const asset = await this.resolveCustomElementAsset(scriptFile);

			if (!asset) {
				continue;
			}

			for (const tagName of tagNames) {
				this.customElementAssets.set(tagName, [asset]);
			}
		}
	}

	private async collectScriptEntries(directory: string): Promise<string[]> {
		const entries = await readdir(directory, { withFileTypes: true });
		const scripts: string[] = [];

		for (const entry of entries) {
			const entryPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				scripts.push(...(await this.collectScriptEntries(entryPath)));
				continue;
			}

			if (/\.script\.(?:ts|tsx)$/.test(entry.name)) {
				scripts.push(entryPath);
			}
		}

		return scripts;
	}

	private async resolveCustomElementAsset(scriptFile: string): Promise<ProcessedAsset | undefined> {
		if (!this.assetProcessingService) {
			return undefined;
		}

		const [asset] = await this.assetProcessingService.processDependencies(
			[
				AssetFactory.createFileScript({
					filepath: scriptFile,
					position: 'head',
					attributes: {
						type: 'module',
						defer: '',
					},
				}),
			],
			`${this.name}:custom-elements:${scriptFile}`,
		);

		return asset;
	}

	private async extractCustomElementTagNames(scriptFile: string): Promise<string[]> {
		const source = await readFile(scriptFile, 'utf8');
		const tagNames = new Set<string>();

		for (const match of source.matchAll(/@customElement\(\s*['"]([^'"]+)['"]/g)) {
			const tagName = match[1];

			if (tagName) {
				tagNames.add(tagName);
			}
		}

		for (const match of source.matchAll(/customElement\(\s*['"]([^'"]+)['"]\s*\)\s*\(/g)) {
			const tagName = match[1];

			if (tagName) {
				tagNames.add(tagName);
			}
		}

		return [...tagNames];
	}
}

/**
 * Creates the JSX integration plugin with resolved defaults.
 */
export const ecopagesJsxPlugin = (options?: EcopagesJsxPluginOptions) => new EcopagesJsxPlugin(options);
