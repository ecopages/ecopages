import {
	IntegrationPlugin,
	type IntegrationRendererBase,
	type IntegrationRuntimeContext,
	type EcoBuildPlugin,
	type IntegrationPluginConfig,
} from '@ecopages/core/plugins/integration-plugin';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import type { EcoPagesAppConfig } from '@ecopages/core';
import { requireAppRuntime } from '@ecopages/core/config/app-runtime';
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

	/**
	 * Returns the build plugins required by the JSX integration.
	 *
	 * @remarks
	 * Returns a new loader declaration without registering or initializing it. The build manifest owns the
	 * resulting instance for the app runtime.
	 */
	override plugins(app: EcoPagesAppConfig): EcoBuildPlugin[] {
		if (!this.mdxCompilerOptions) {
			return [];
		}

		return [
			createMdxLoaderPlugin({
				compilerOptions: this.mdxCompilerOptions,
				extensions: this.mdxExtensions,
				projectRoot: app.rootDir,
				requestPipelineMetrics: requireAppRuntime(app).requestPipelineMetrics,
			}),
		];
	}

	/** Creates the renderer instance with the resolved JSX integration runtime options. */
	override createRenderer(base: IntegrationRendererBase): EcopagesJsxRenderer {
		const jsxConfig = {
			mdxExtensions: this.mdxExtensions,
			radiantSsrEnabled: this.includeRadiant,
		};
		const customRendererOptions = { ...base, jsxConfig };
		const renderer =
			this.renderer === EcopagesJsxRenderer
				? new (createEcopagesJsxRenderer(jsxConfig))(base)
				: new this.renderer({
						...customRendererOptions,
						hooks: createEcopagesJsxRendererHookFactory(jsxConfig),
					});

		renderer.name ||= this.name;
		return renderer;
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
	override hmr(context: IntegrationRuntimeContext): void {
		super.hmr(context);
		const manager = context.runtime.hmr;
		if (!manager) return;
		const preloadScopes = context.runtime.customElementSsrPreloadScopes;

		const hmrContext = manager.getDefaultContext();
		const absolutePaths = context.appConfig.absolutePaths;
		const strategy = new EcopagesJsxHmrStrategy({
			getRegisteredEntrypoints: hmrContext.getRegisteredEntrypoints,
			getSrcDir: hmrContext.getSrcDir,
			getPagesDir: hmrContext.getPagesDir,
			getLayoutsDir: hmrContext.getLayoutsDir,
			getIncludesDir: () => absolutePaths.includesDir,
			getTemplateExtensions: () => this.extensions,
		});

		manager.registerStrategy(strategy);
		manager.registerDevTransformContributor(
			new EcopagesJsxDevTransformContributor({
				strategy,
				getMdxLoaderPlugin: () =>
					context.runtime.buildManifest.server.find((plugin) => plugin.name === 'ecopages-jsx-mdx-loader'),
			}),
		);

		if (!this.includeRadiant) {
			return;
		}

		if (preloadScopes) {
			manager.onScriptEntrypointChanged?.((scriptPath) =>
				invalidateRadiantRegisteredScriptSsrRegistration(preloadScopes, scriptPath),
			);
		}
	}
}

/**
 * Creates the JSX integration plugin with resolved defaults.
 */
export const ecopagesJsxPlugin = (options?: EcopagesJsxPluginOptions): EcopagesJsxPlugin =>
	new EcopagesJsxPlugin(options);
