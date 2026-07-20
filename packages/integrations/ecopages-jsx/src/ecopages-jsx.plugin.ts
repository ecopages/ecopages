import {
	IntegrationPlugin,
	type EcoBuildPlugin,
	type IntegrationPluginConfig,
} from '@ecopages/core/plugins/integration-plugin';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import type { IHmrManager } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import { RADIANT_INSTALL_HYDRATOR_FILEPATH } from './resolve-radiant-install-hydrator.ts';
import {
	appendMdxExtensions,
	createMdxLoaderPlugin,
	registerBunMdxPlugin,
	resolveMdxCompilerOptions,
	type ResolvedMdxCompileOptions,
} from './ecopages-jsx-mdx.ts';
import { EcopagesJsxRenderer } from './ecopages-jsx-renderer.ts';
import { EcopagesJsxHmrStrategy } from './ecopages-jsx-hmr-strategy.ts';
import { EcopagesJsxDevTransformContributor } from './dev-transform/ecopages-jsx-dev-transform-contributor.ts';
import { assignPageOwnedContentScriptGroupedBundles } from './page-owned-content-script-grouping.ts';
import { invalidateRadiantRegisteredScriptSsrRegistration } from './radiant-registered-script-ssr-invalidation.ts';
import type { EcopagesJsxPluginOptions } from './ecopages-jsx.types.ts';

export type {
	EcopagesJsxMdxOptions,
	EcopagesJsxPluginOptions,
	EcopagesJsxRendererConfig,
} from './ecopages-jsx.types.ts';

const RADIANT_HYDRATOR_SCRIPT_ID = 'ecopages-jsx-radiant-hydrator';

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

	private includeRadiant: boolean;
	private mdxEnabled: boolean;
	private mdxCompilerOptions?: ResolvedMdxCompileOptions;
	private mdxExtensions: string[];
	private mdxLoaderPlugin?: EcoBuildPlugin;

	/** Returns the build plugins required by the JSX integration. */
	override get plugins(): EcoBuildPlugin[] {
		return [this.mdxLoaderPlugin].filter((plugin): plugin is EcoBuildPlugin => plugin !== undefined);
	}

	/** Creates the renderer instance with the resolved JSX integration runtime options. */
	override initializeRenderer(options?: { rendererModules?: unknown }): EcopagesJsxRenderer {
		return this.attachRendererRuntimeServices(
			new this.renderer({
				...this.createRendererOptions(options),
				jsxConfig: {
					mdxExtensions: this.mdxExtensions,
					radiantSsrEnabled: this.includeRadiant,
				},
			}),
		);
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
		this.mdxEnabled = mdxEnabled;
		this.mdxExtensions = mdxExtensions;
		this.mdxCompilerOptions = mdxCompilerOptions;

		if (this.includeRadiant) {
			this.integrationDependencies.unshift(...this.getDependencies());
		}
	}

	private getDependencies(): AssetDefinition[] {
		return [
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: RADIANT_INSTALL_HYDRATOR_FILEPATH,
				bundle: false,
				attributes: {
					'data-eco-script-id': RADIANT_HYDRATOR_SCRIPT_ID,
				},
			}),
		];
	}

	/** Ensures MDX build hooks are ready before Ecopages collects contributions. */
	override async prepareBuildContributions(): Promise<void> {
		this.ensureMdxLoaderPlugin();
	}

	/** Assigns grouped-build metadata for page-owned JSX content scripts. */
	override prepareAssetDependencies(dependencies: AssetDefinition[]): AssetDefinition[] {
		return assignPageOwnedContentScriptGroupedBundles(dependencies);
	}

	/** Registers JSX HMR strategy, dev-transform plugins, and Radiant SSR invalidation hooks. */
	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);

		const strategy = this.getHmrStrategy();
		const registerContributor = (hmrManager as { registerDevTransformContributor?: (contributor: unknown) => void })
			.registerDevTransformContributor;
		if (strategy && registerContributor) {
			registerContributor.call(
				hmrManager,
				new EcopagesJsxDevTransformContributor({
					strategy: strategy as EcopagesJsxHmrStrategy,
					getMdxLoaderPlugin: () => this.mdxLoaderPlugin,
				}),
			);
		}

		if (!this.includeRadiant || !this.appConfig) {
			return;
		}

		const runtime = this.appConfig.runtime ?? {};
		this.appConfig.runtime = runtime;
		runtime.registeredScriptEntrypointChangeHandlers ??= [];
		runtime.registeredScriptEntrypointChangeHandlers.push(invalidateRadiantRegisteredScriptSsrRegistration);
	}

	/**
	 * Returns the JSX-integration HMR strategy.
	 *
	 * @remarks
	 * The strategy handles `layout-update` broadcasts for page sources, layout
	 * sources, and any component file in the active render tree. It defers
	 * registered script entrypoints to the generic JS strategy and includes /
	 * explicit server views to `ServerRenderedTemplateHmrStrategy`.
	 */
	override getHmrStrategy(): HmrStrategy | undefined {
		if (!this.hmrManager || !this.appConfig) {
			return undefined;
		}

		const context = this.hmrManager.getDefaultContext();
		const absolutePaths = this.appConfig.absolutePaths;

		return new EcopagesJsxHmrStrategy({
			getRegisteredEntrypoints: context.getRegisteredEntrypoints,
			getSrcDir: context.getSrcDir,
			getPagesDir: context.getPagesDir,
			getLayoutsDir: context.getLayoutsDir,
			getIncludesDir: () => absolutePaths.includesDir,
			getTemplateExtensions: () => this.extensions,
		});
	}

	/**
	 * Registers MDX tooling and completes the base integration setup.
	 */
	override async setup(): Promise<void> {
		this.ensureMdxLoaderPlugin();

		if (typeof Bun !== 'undefined' && this.mdxEnabled && this.mdxCompilerOptions) {
			await this.registerMdxBunPlugin();
		}

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

		await registerBunMdxPlugin(this.mdxCompilerOptions, this.mdxExtensions);
	}
}

/**
 * Creates the JSX integration plugin with resolved defaults.
 */
export const ecopagesJsxPlugin = (options?: EcopagesJsxPluginOptions) => new EcopagesJsxPlugin(options);
