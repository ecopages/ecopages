import {
	IntegrationPlugin,
	type EcoBuildPlugin,
	type IntegrationPluginConfig,
} from '@ecopages/core/plugins/integration-plugin';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import type { EcoPagesAppConfig, IHmrManager } from '@ecopages/core';
import { requireAppRuntime } from '@ecopages/core/config/app-runtime';
import type { RequestPipelineMetricsState } from '@ecopages/core/diagnostics/request-pipeline-metrics';
import type { JsxRenderable } from '@ecopages/jsx';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import { RADIANT_INSTALL_HYDRATOR_FILEPATH } from './resolve-radiant-install-hydrator.ts';
import {
	appendMdxExtensions,
	createMdxLoaderPlugin,
	resolveMdxCompilerOptions,
	type ResolvedMdxCompileOptions,
} from './ecopages-jsx-mdx.ts';
import {
	createEcopagesJsxRenderer,
	createEcopagesJsxRendererHookFactory,
	EcopagesJsxRenderer,
} from './ecopages-jsx-renderer.ts';
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
	mdxExtensions: string[];
	mdxCompilerOptions?: ResolvedMdxCompileOptions;
};

/**
 * Resolves user-facing plugin options into a fully-defaulted internal config.
 *
 * Defaults:
 * - `extensions`: `['.tsx']`
 * - `radiant`: `true`
 * - MDX is disabled when `mdx` is omitted
 * - `mdx.extensions`: `['.mdx']`
 */
const resolvePluginOptions = (options?: EcopagesJsxPluginOptions): ResolvedJsxPluginConfig => {
	const { extensions: userExtensions, radiant, mdx, ...baseConfig } = options ?? {};

	const extensions = [...(userExtensions ?? ['.tsx'])];
	const mdxExtensions = mdx?.extensions ?? ['.mdx'];
	const mdxEnabled = mdx !== undefined;

	if (mdxEnabled) {
		appendMdxExtensions(extensions, mdxExtensions);
	}

	return {
		...baseConfig,
		extensions,
		includeRadiant: radiant ?? true,
		mdxExtensions,
		mdxCompilerOptions: mdxEnabled && mdx ? resolveMdxCompilerOptions(mdx) : undefined,
	};
};

/** JSX integration plugin for Ecopages, supporting `.tsx` templates and optional Radiant web components. */
export class EcopagesJsxPlugin extends IntegrationPlugin<JsxRenderable> {
	renderer = EcopagesJsxRenderer;
	override readonly bundlesPageDependencies = true;

	private includeRadiant: boolean;
	private mdxCompilerOptions?: ResolvedMdxCompileOptions;
	private mdxExtensions: string[];
	private readonly mdxLoaderPlugins = new WeakMap<RequestPipelineMetricsState, EcoBuildPlugin>();

	/**
	 * Returns the build plugins required by the JSX integration.
	 *
	 * @remarks
	 * The MDX loader is created on the first read for an app runtime and kept, because the development transform
	 * contributor reuses the instance the build manifest holds.
	 */
	override plugins(app: EcoPagesAppConfig): EcoBuildPlugin[] {
		if (!this.mdxCompilerOptions) {
			return [];
		}

		const requestPipelineMetrics = requireAppRuntime(app).requestPipelineMetrics;
		let plugin = this.mdxLoaderPlugins.get(requestPipelineMetrics);
		if (!plugin) {
			plugin = createMdxLoaderPlugin({
				compilerOptions: this.mdxCompilerOptions,
				extensions: this.mdxExtensions,
				projectRoot: app.rootDir,
				requestPipelineMetrics,
			});
			this.mdxLoaderPlugins.set(requestPipelineMetrics, plugin);
		}
		return [plugin];
	}

	/** Creates the renderer instance with the resolved JSX integration runtime options. */
	override initializeRenderer(): EcopagesJsxRenderer {
		const jsxConfig = {
			mdxExtensions: this.mdxExtensions,
			radiantSsrEnabled: this.includeRadiant,
		};
		const rendererOptions = this.createRendererOptions();
		const customRendererOptions = { ...rendererOptions, jsxConfig };
		const renderer =
			this.renderer === EcopagesJsxRenderer
				? new (createEcopagesJsxRenderer(jsxConfig))(rendererOptions)
				: new this.renderer({
						...customRendererOptions,
						hooks: createEcopagesJsxRendererHookFactory(jsxConfig),
					});

		return this.attachRendererRuntimeServices(renderer);
	}

	constructor(options?: EcopagesJsxPluginOptions) {
		const config = resolvePluginOptions(options);
		const { extensions, includeRadiant, mdxExtensions, mdxCompilerOptions, ...baseConfig } = config;

		super({
			name: ECOPAGES_JSX_PLUGIN_NAME,
			extensions,
			jsxImportSource: '@ecopages/jsx',
			...baseConfig,
		});

		this.includeRadiant = includeRadiant;
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

	/** Assigns grouped-build metadata for page-owned JSX content scripts. */
	override prepareAssetDependencies(dependencies: AssetDefinition[]): AssetDefinition[] {
		return assignPageOwnedContentScriptGroupedBundles(dependencies);
	}

	/** Registers JSX HMR strategy, dev-transform plugins, and Radiant SSR invalidation hooks. */
	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);
		const preloadScopes = this.appConfig
			? requireAppRuntime(this.appConfig).customElementSsrPreloadScopes
			: undefined;

		const strategy = this.getHmrStrategy();
		if (strategy) {
			hmrManager.registerDevTransformContributor(
				new EcopagesJsxDevTransformContributor({
					strategy: strategy as EcopagesJsxHmrStrategy,
					getMdxLoaderPlugin: () =>
						this.appConfig
							? this.mdxLoaderPlugins.get(requireAppRuntime(this.appConfig).requestPipelineMetrics)
							: undefined,
				}),
			);
		}

		if (!this.includeRadiant) {
			return;
		}

		if (preloadScopes) {
			hmrManager.onScriptEntrypointChanged?.((scriptPath) =>
				invalidateRadiantRegisteredScriptSsrRegistration(preloadScopes, scriptPath),
			);
		}
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
}

/**
 * Creates the JSX integration plugin with resolved defaults.
 */
export const ecopagesJsxPlugin = (options?: EcopagesJsxPluginOptions): EcopagesJsxPlugin =>
	new EcopagesJsxPlugin(options);
