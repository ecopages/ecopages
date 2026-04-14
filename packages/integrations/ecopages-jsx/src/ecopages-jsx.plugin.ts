import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { CompileOptions } from '@mdx-js/mdx';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { AssetFactory, type ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { JsxRenderable } from '@ecopages/jsx';
import { VFile } from 'vfile';
import { EcopagesJsxRenderer } from './ecopages-jsx-renderer.ts';
import { JsxRuntimeBundleService } from './services/jsx-runtime-bundle.service.ts';

type MdxPluginList = NonNullable<CompileOptions['remarkPlugins']>;

type MdxCompileOptions = Omit<
	CompileOptions,
	'jsxImportSource' | 'jsxRuntime' | 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'
> & {
	remarkPlugins?: MdxPluginList;
	rehypePlugins?: MdxPluginList;
	recmaPlugins?: MdxPluginList;
};

type ResolvedMdxCompileOptions = MdxCompileOptions & Pick<CompileOptions, 'jsxImportSource' | 'jsxRuntime'>;

const mergePluginLists = <T>(...lists: Array<readonly T[] | null | undefined>): T[] | undefined => {
	const merged = lists.flatMap((list) => (list ? [...list] : []));
	return merged.length > 0 ? merged : undefined;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createMdxLoaderPlugin = (compilerOptions: ResolvedMdxCompileOptions, extensions: string[]): EcoBuildPlugin => {
	const escapedExts = extensions.map(escapeRegex);
	const filter = new RegExp(`(${escapedExts.join('|')})(\\?.*)?$`);

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

/**
 * Stable integration name shared by the JSX plugin and renderer.
 *
 * Ecopages uses this identifier to match route files, renderer instances, and
 * cross-integration component boundaries.
 */
export const ECOPAGES_JSX_PLUGIN_NAME = 'ecopages-jsx';

/**
 * MDX configuration for the JSX integration.
 *
 * Mirrors Ecopages' built-in combined integration pattern where a single
 * JSX-capable plugin can own both `.tsx` and `.mdx` route files.
 */
export type EcopagesJsxMdxOptions = {
	/** Enables MDX file handling inside the JSX integration. */
	enabled: boolean;
	/** Additional MDX compiler options. JSX runtime fields are managed by the integration. */
	compilerOptions?: MdxCompileOptions;
	/** Extra remark plugins appended to `compilerOptions.remarkPlugins`. */
	remarkPlugins?: MdxPluginList;
	/** Extra rehype plugins appended to `compilerOptions.rehypePlugins`. */
	rehypePlugins?: MdxPluginList;
	/** Extra recma plugins appended to `compilerOptions.recmaPlugins`. */
	recmaPlugins?: MdxPluginList;
	/** Custom file extensions to treat as MDX. */
	extensions?: string[];
};

/** Options for the JSX integration plugin. */
export type EcopagesJsxPluginOptions = Omit<IntegrationPluginConfig, 'name' | 'extensions'> & {
	/** Optional JSX route extensions. Defaults to `.tsx`. */
	extensions?: string[];
	/**
	 * Whether to include the `@ecopages/radiant` and `@ecopages/signals` vendor
	 * bundles and bare-specifier mappings.
	 *
	 * Set to `false` when pages do not use Radiant web components.
	 * @default true
	 */
	radiant?: boolean;
	/** Optional MDX integration configuration. */
	mdx?: EcopagesJsxMdxOptions;
};

/** JSX integration plugin for Ecopages, supporting `.tsx` templates and optional Radiant web components. */
export class EcopagesJsxPlugin extends IntegrationPlugin<JsxRenderable> {
	/** Renderer implementation used for JSX and MDX routes. */
	renderer = EcopagesJsxRenderer as unknown as IntegrationPlugin<JsxRenderable>['renderer'];
	private intrinsicCustomElementAssets = new Map<string, readonly ProcessedAsset[]>();
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
		return [this.runtimeBundleService.getBuildPlugin()].filter(
			(plugin): plugin is EcoBuildPlugin => plugin !== undefined,
		);
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
	override initializeRenderer() {
		const renderer = super.initializeRenderer() as EcopagesJsxRenderer;
		renderer.setIntrinsicCustomElementAssets(this.intrinsicCustomElementAssets);
		renderer.setRadiantSsrEnabled(this.includeRadiant);
		return renderer;
	}

	/**
	 * Creates a JSX integration plugin.
	 *
	 * When MDX is enabled, the plugin also claims the configured MDX extensions
	 * and prepares compiler options around the shared `@ecopages/jsx` runtime.
	 */
	constructor(options?: EcopagesJsxPluginOptions) {
		const { extensions: _ignoredExtensions, ...restOptions } = options ?? {};
		const extensions = [...(options?.extensions ?? ['.tsx'])];
		const mdxExtensions = options?.mdx?.extensions ?? ['.mdx'];
		const includeRadiant = options?.radiant ?? true;

		if (options?.mdx?.enabled) {
			for (const extension of mdxExtensions) {
				if (!extensions.includes(extension)) {
					extensions.push(extension);
				}
			}
		}

		super({
			name: ECOPAGES_JSX_PLUGIN_NAME,
			extensions,
			jsxImportSource: '@ecopages/jsx',
			...restOptions,
		});

		this.includeRadiant = includeRadiant;
		this.runtimeBundleService = new JsxRuntimeBundleService({ radiant: includeRadiant });
		this.mdxEnabled = options?.mdx?.enabled ?? false;
		this.mdxExtensions = mdxExtensions;
		EcopagesJsxRenderer.mdxExtensions = this.mdxExtensions;

		if (this.mdxEnabled) {
			const { compilerOptions, remarkPlugins, rehypePlugins, recmaPlugins } = options?.mdx ?? {};
			const resolvedCompilerOptions: ResolvedMdxCompileOptions = {
				format: 'detect',
				outputFormat: 'program',
				...compilerOptions,
				jsxImportSource: '@ecopages/jsx',
				jsxRuntime: 'automatic',
				development: process.env.NODE_ENV === 'development',
			};

			const mergedRemarkPlugins = mergePluginLists(compilerOptions?.remarkPlugins, remarkPlugins);
			const mergedRehypePlugins = mergePluginLists(compilerOptions?.rehypePlugins, rehypePlugins);
			const mergedRecmaPlugins = mergePluginLists(compilerOptions?.recmaPlugins, recmaPlugins);

			if (mergedRemarkPlugins) {
				resolvedCompilerOptions.remarkPlugins = mergedRemarkPlugins;
			}

			if (mergedRehypePlugins) {
				resolvedCompilerOptions.rehypePlugins = mergedRehypePlugins;
			}

			if (mergedRecmaPlugins) {
				resolvedCompilerOptions.recmaPlugins = mergedRecmaPlugins;
			}

			this.mdxCompilerOptions = resolvedCompilerOptions;
		}
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
			await this.setupMdxBunPlugin();
		}

		await this.buildIntrinsicCustomElementAssetRegistry();

		await super.setup();
	}

	/**
	 * Defers boundaries only when another integration renders a component that is
	 * owned by this JSX integration.
	 */
	override shouldDeferComponentBoundary(input: { currentIntegration: string; targetIntegration?: string }): boolean {
		return input.targetIntegration === this.name && input.currentIntegration !== this.name;
	}

	private ensureMdxLoaderPlugin(): void {
		if (!this.mdxEnabled || !this.mdxCompilerOptions || this.mdxLoaderPlugin) {
			return;
		}

		this.mdxLoaderPlugin = createMdxLoaderPlugin(this.mdxCompilerOptions, this.mdxExtensions);
	}

	private async setupMdxBunPlugin(): Promise<void> {
		if (typeof Bun === 'undefined' || !this.mdxEnabled || !this.mdxCompilerOptions) {
			return;
		}

		const compilerOptions = this.mdxCompilerOptions;
		const escapedExts = this.mdxExtensions.map(escapeRegex);
		const filter = new RegExp(`(${escapedExts.join('|')})$`);

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

	private async buildIntrinsicCustomElementAssetRegistry(): Promise<void> {
		if (!this.appConfig || !this.assetProcessingService) {
			return;
		}

		this.intrinsicCustomElementAssets.clear();
		const scriptFiles = await this.collectScriptEntryFiles(this.appConfig.absolutePaths.srcDir);

		for (const scriptFile of scriptFiles) {
			const tagNames = await this.extractIntrinsicCustomElementTagNames(scriptFile);

			if (tagNames.length === 0) {
				continue;
			}

			const processedAsset = await this.resolveIntrinsicCustomElementAsset(scriptFile);

			if (!processedAsset) {
				continue;
			}

			for (const tagName of tagNames) {
				this.intrinsicCustomElementAssets.set(tagName, [processedAsset]);
			}
		}
	}

	private async collectScriptEntryFiles(directory: string): Promise<string[]> {
		const directoryEntries = await readdir(directory, { withFileTypes: true });
		const scriptFiles: string[] = [];

		for (const directoryEntry of directoryEntries) {
			const entryPath = path.join(directory, directoryEntry.name);

			if (directoryEntry.isDirectory()) {
				scriptFiles.push(...(await this.collectScriptEntryFiles(entryPath)));
				continue;
			}

			if (/\.script\.(?:ts|tsx)$/.test(directoryEntry.name)) {
				scriptFiles.push(entryPath);
			}
		}

		return scriptFiles;
	}

	private async resolveIntrinsicCustomElementAsset(scriptFile: string): Promise<ProcessedAsset | undefined> {
		if (!this.assetProcessingService) {
			return undefined;
		}

		const [processedAsset] = await this.assetProcessingService.processDependencies(
			[
				AssetFactory.createFileScript({
					filepath: scriptFile,
					position: 'head',
				}),
			],
			`${this.name}:intrinsic-custom-elements:${scriptFile}`,
		);

		return processedAsset;
	}

	private async extractIntrinsicCustomElementTagNames(scriptFile: string): Promise<string[]> {
		const source = await readFile(scriptFile, 'utf8');
		const tagNames = new Set<string>();

		for (const match of source.matchAll(/@customElement\(\s*['"]([^'"]+)['"]/g)) {
			const tagName = match[1];

			if (tagName) {
				tagNames.add(tagName);
			}
		}

		return [...tagNames];
	}
}

/**
 * Creates the JSX integration plugin.
 */
export const ecopagesJsxPlugin = (options?: EcopagesJsxPluginOptions) => new EcopagesJsxPlugin(options);
