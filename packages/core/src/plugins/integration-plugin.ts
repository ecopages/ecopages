import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import {
	createBrowserRuntimeManifest,
	type BrowserRuntimeManifest,
} from '../build/browser/browser-runtime-manifest.ts';
import type { AppRuntime } from '../config/assembly/app-runtime.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { EcoPageFile, EcoPagesElement } from '../types/contracts.ts';
import type {
	IntegrationRenderer,
	IntegrationRendererOptions,
} from '../route-renderer/orchestration/integration-renderer.ts';
import { AssetProcessingService } from '../assets/asset-processing-service/asset-processing.service.ts';
import type { AssetDefinition, ProcessedAsset } from '../assets/asset-processing-service/assets.types.ts';
import { deepMerge } from '../utils/deep-merge.ts';
import type { StaticExportContext, StaticExportRelease } from '../static-site-generator/static-export-context.ts';
import { installConfiguredServerDom, type ServerDomInstaller } from './server-dom.ts';

export type { ServerDomInstaller, ServerDomSurfaceKind } from './server-dom.ts';

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
export type { PageBrowserGraphContribution, PageBrowserGraphContributionContext } from '../types/contracts.ts';
export type { StaticExportContext, StaticExportRelease } from '../static-site-generator/static-export-context.ts';

export type {
	HtmlDocumentContribution,
	HtmlDocumentContributionContext,
} from '../route-renderer/orchestration/integration-renderer.ts';

/**
 * Type-erased integration plugin stored in app-level registries.
 *
 * Ecopages keeps one heterogeneous integration list, while each plugin and
 * renderer still owns its framework-specific render payload type internally.
 *
 * @remarks
 * The plugin contract currently constructs the Build-layer asset service and runtime manifest; #556
 * tracks moving those implementations behind the plugin contracts layer.
 */
export type AnyIntegrationPlugin = IntegrationPlugin<unknown>;

export const INTEGRATION_PLUGIN_ERRORS = {
	NOT_INITIALIZED_WITH_APP_CONFIG: 'Plugin not initialized with app config',
} as const;

export function mergeIntegrationOptions<TDefaults, TOverrides>(
	defaults: TDefaults,
	overrides: TOverrides,
): TDefaults & TOverrides {
	return deepMerge(defaults, overrides);
}

/**
 * Base configuration shared by all integration plugins.
 *
 * @remarks
 * Integrations declare their file ownership and
 * any global assets or build-time contributions here. Runtime-only side effects
 * belong in `setup()` rather than the constructor.
 */
export interface IntegrationPluginConfig {
	/**
	 * The name of the integration plugin.
	 */
	name: string;
	/**
	 * The extensions that this plugin supports (e.g., ['.kita.js', '.kita.tsx']).
	 */
	extensions: string[];
	/**
	 * The dependencies that this plugin requires on a global level.
	 * These dependencies will be resolved during the setup process and injected into the global scope of the application.
	 * They are not specific to any particular page or component.
	 */
	integrationDependencies?: AssetDefinition[];
	/**
	 * JSX import source owned by this integration.
	 *
	 * @remarks
	 * This is primarily used by mixed-JSX flows where host-owned browser bundles
	 * need to preserve the correct JSX runtime for files claimed by the
	 * integration.
	 */
	jsxImportSource?: string;
	/** Browser runtime rewrites declared as data for the app build manifest. */
	browserRuntimeManifest?: BrowserRuntimeManifest;
}

type RendererClass<C> = new (
	options: IntegrationRendererOptions & { resolvedIntegrationDependencies: ProcessedAsset[] },
) => IntegrationRenderer<C>;

export interface IntegrationRuntimeContext {
	appConfig: EcoPagesAppConfig;
	runtime: AppRuntime;
}

export type IntegrationRendererBase = IntegrationRendererOptions & {
	resolvedIntegrationDependencies: ProcessedAsset[];
};

/**
 * Base class for framework integrations.
 *
 * @remarks
 * An integration owns three main concerns:
 * - which file extensions it claims
 * - which renderer class turns those files into HTML
 * - which build-time or runtime contributions must be registered for that framework
 *
 * Core owns lifecycle ordering. Integrations declare contributions through the
 * hooks on this class, while config finalization and app startup decide when
 * those hooks run. `plugins` declares environment-selected build hooks and
 * `browserRuntimeManifest` declares client import rewrites. For page-browser and
 * document shaping, integrations should prefer the contribution contracts
 * re-exported from this module:
 * `PageBrowserGraphContribution` / `PageBrowserGraphContributionContext` and
 * `HtmlDocumentContribution` / `HtmlDocumentContributionContext`.
 */
export abstract class IntegrationPlugin<C = EcoPagesElement> {
	readonly name: string;
	readonly extensions: string[];
	abstract renderer: RendererClass<C>;
	readonly jsxImportSource?: string;
	readonly browserRuntimeManifest: BrowserRuntimeManifest;

	/**
	 * Whether this Integration's Pages can receive Params from `[param]` and `[...param]`
	 * filenames.
	 *
	 * @remarks
	 * An Integration whose Pages cannot export `staticPaths` or read params overrides it with
	 * `false`, and route discovery then rejects those filenames instead of failing at render.
	 * It describes the Integration, so it is a class member rather than a user option.
	 */
	readonly acceptsParams: boolean = true;
	/** Whether core may collapse this Integration's eligible Page assets into page-owned bundles. */
	readonly bundlesPageDependencies: boolean = false;
	/**
	 * Server DOM installer this Integration contributes, if any.
	 *
	 * @remarks
	 * Core runs every configured `complete` installer, then every `repair`, before
	 * Integration `setup()` continues. Config order does not change the result.
	 * Omit this when the Integration does not install DOM globals.
	 */
	readonly serverDom?: ServerDomInstaller;

	protected integrationDependencies: AssetDefinition[];
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	protected appConfig?: EcoPagesAppConfig;
	protected runtime?: AppRuntime;
	protected assetProcessingService?: AssetProcessingService;
	private rendererInstance?: IntegrationRenderer<C>;

	/**
	 * Declares the build plugins this Integration contributes.
	 *
	 * @remarks
	 * Core reads it once, during config finalization, and it is the only plugin method finalization calls. It must
	 * not do I/O or start work: state a plugin needs belongs in {@link setup} or is created lazily by the plugin's
	 * own callbacks. Plugins declare their environments; omitted environments apply to both server and browser
	 * builds, and browser-only hooks use `['browser']`.
	 *
	 * @param app - The app config being finalized.
	 */
	plugins(_app: EcoPagesAppConfig): EcoBuildPlugin[] {
		return [];
	}

	/**
	 * Creates the integration with static declaration-only configuration.
	 *
	 * @remarks
	 * Constructors are expected to stay side-effect free. Build plugins belong in
	 * `plugins(app)` and runtime setup belongs in `setup()`.
	 */
	constructor(config: IntegrationPluginConfig) {
		this.name = config.name;
		this.extensions = config.extensions;
		this.integrationDependencies = config.integrationDependencies || [];
		this.jsxImportSource = config.jsxImportSource;
		this.browserRuntimeManifest = config.browserRuntimeManifest ?? createBrowserRuntimeManifest();
	}

	/**
	 * Compiles one of this Integration's Page files, or its `html.*` template, in-process instead
	 * of letting core bundle it.
	 *
	 * @remarks
	 * For Integrations whose files are not JavaScript modules, such as core's HTML Pages. Core
	 * calls it for every file of the Integration that it loads as a module, and never bundles
	 * those files itself.
	 *
	 * Production emit records the compiled module through {@link serializeCompiledPageModule}.
	 * Development caches the result by the file's content hash, so editing another file it
	 * reads does not invalidate it.
	 */
	compilePageModule?(filePath: string, appConfig: EcoPagesAppConfig): EcoPageFile | Promise<EcoPageFile>;

	/**
	 * Records a {@link compilePageModule} result so production can import it without compiling.
	 */
	serializeCompiledPageModule?(
		module: EcoPageFile,
		context: { rootDir: string; filePath: string },
	): { contents: string };

	/**
	 * Restores a {@link serializeCompiledPageModule} record for production import.
	 */
	reviveCompiledPageModule?(contents: string, context: { rootDir: string; filePath: string }): EcoPageFile;

	/**
	 * Returns processed global assets resolved during `setup()`.
	 */
	getResolvedIntegrationDependencies(): ProcessedAsset[] {
		return this.resolvedIntegrationDependencies;
	}

	/**
	 * Creates the common renderer options from runtime setup state.
	 *
	 * @remarks
	 * `getRenderer()` caches one renderer for this Integration. The renderer and
	 * this Integration share its asset-processing service. An unchanged file
	 * asset is reused until its source hash changes, its output is missing, or a
	 * development change batch drops the entry. The cache key is the dependency
	 * identity; the source hash is the freshness check.
	 */
	private createRendererBase(): IntegrationRendererBase {
		if (!this.appConfig || !this.assetProcessingService) {
			throw new Error(INTEGRATION_PLUGIN_ERRORS.NOT_INITIALIZED_WITH_APP_CONFIG);
		}

		return {
			appConfig: this.appConfig,
			assetProcessingService: this.assetProcessingService,
			assetProcessingIntegration: this,
			resolvedIntegrationDependencies: this.resolvedIntegrationDependencies,
		};
	}

	/**
	 * Creates a renderer with the common options from runtime setup.
	 *
	 * @remarks
	 * Core calls this once per Integration runtime. Override it to add framework-specific renderer options.
	 */
	createRenderer(base: IntegrationRendererBase): IntegrationRenderer<C> {
		const renderer = new this.renderer(base);
		renderer.name ||= this.name;
		return renderer;
	}

	/**
	 * Returns the renderer shared by this Integration's application runtime.
	 */
	getRenderer(): IntegrationRenderer<C> {
		this.rendererInstance ??= this.createRenderer(this.createRendererBase());
		this.rendererInstance.name ||= this.name;
		return this.rendererInstance;
	}

	/** Shapes one dependency batch before core asset processing runs. */
	prepareAssetDependencies?(dependencies: AssetDefinition[]): AssetDefinition[];

	/**
	 * Runs integration-specific setup before static page generation begins and returns how to undo it.
	 *
	 * @remarks
	 * Integrations that need build-scoped SSR preload or worker sessions start them here rather than per-page
	 * inside the renderer. The returned function releases whatever this call started. Core awaits every release
	 * after the export, in reverse order, whether it succeeded or failed, so the process does not depend on
	 * `process.exit()` to stop a worker. A release that throws is logged and does not fail the export.
	 */
	staticExport?(context: StaticExportContext): Promise<StaticExportRelease | void>;

	/**
	 * Performs runtime integration setup, after config finalization has sealed the build manifest.
	 */
	async setup(context: IntegrationRuntimeContext): Promise<void> {
		await installConfiguredServerDom(context.appConfig.integrations);
		this.appConfig = context.appConfig;
		this.runtime = context.runtime;
		this.rendererInstance = undefined;
		this.assetProcessingService = AssetProcessingService.createWithDefaultProcessors(context.appConfig);
		if (context.runtime.hmr) {
			this.assetProcessingService.setHmrManager(context.runtime.hmr);
		}
		this.resolvedIntegrationDependencies = await this.assetProcessingService.processDependencies(
			this.integrationDependencies,
			this,
		);
	}

	/** Registers Integration-owned development behavior against the app runtime. */
	hmr(context: IntegrationRuntimeContext): void {
		const manager = context.runtime.hmr;
		if (!manager) return;
		this.assetProcessingService?.setHmrManager(manager);
		this.rendererInstance?.setHmrManager(manager);
	}

	/**
	 * Releases runtime resources owned by the integration.
	 *
	 * @remarks
	 * Core calls this after static-export releases and when the app stops or restarts,
	 * after in-flight `setup()` calls finish. On stop or restart it also waits for
	 * active prewarm renders and page-cache regenerations. It then clears activation
	 * state so the next runtime activation runs `setup()` again.
	 * Most integrations do not need custom teardown. Override this only for
	 * explicit cleanup such as watchers, compiler handles, or runtime registries
	 * that outlive individual requests.
	 */
	async teardown(): Promise<void> {}
}
