import type { EcoBuildPlugin } from '../build/build-types.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';
import type { HmrStrategy } from '../hmr/hmr-strategy.ts';
import type { EcoPagesElement } from '../types/public-types.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import { AssetProcessingService } from '../services/assets/asset-processing-service/asset-processing.service.ts';
import type { AssetDefinition, ProcessedAsset } from '../services/assets/asset-processing-service/assets.types.ts';
import type { RuntimeCapabilityDeclaration } from './runtime-capability.ts';

export type { RuntimeCapabilityDeclaration, RuntimeCapabilityTag } from './runtime-capability.ts';

export const INTEGRATION_PLUGIN_ERRORS = {
	NOT_INITIALIZED_WITH_APP_CONFIG: 'Plugin not initialized with app config',
	NOT_INITIALIZED_WITH_ASSET_SERVICE: 'Plugin not initialized with asset dependency service',
} as const;

/**
 * Base configuration shared by all integration plugins.
 *
 * @remarks
 * Integrations declare their file ownership, optional runtime requirements, and
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
	 * The strategy to use for static building.
	 * - 'render': Execute component function directly (faster, efficient).
	 * - 'fetch': Start server and fetch URL (slower, needed for some SSR like Lit).
	 * @default 'render'
	 */
	staticBuildStep?: 'render' | 'fetch';
	/**
	 * Declares runtime-specific requirements that must be satisfied before the
	 * app can start with this integration enabled.
	 */
	runtimeCapability?: RuntimeCapabilityDeclaration;
	/**
	 * JSX import source owned by this integration.
	 *
	 * @remarks
	 * This is primarily used by mixed-JSX flows where host-owned browser bundles
	 * need to preserve the correct JSX runtime for files claimed by the
	 * integration.
	 */
	jsxImportSource?: string;
}

type RendererClass<C> = new (options: {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	rendererModules?: unknown;
	runtimeOrigin: string;
}) => IntegrationRenderer<C>;

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
 * hooks on this class, while `ConfigBuilder.build()` and app startup decide when
 * those hooks run.
 */
export abstract class IntegrationPlugin<C = EcoPagesElement> {
	readonly name: string;
	readonly extensions: string[];
	abstract renderer: RendererClass<C>;
	readonly staticBuildStep: 'render' | 'fetch';
	readonly runtimeCapability?: RuntimeCapabilityDeclaration;
	readonly jsxImportSource?: string;

	protected integrationDependencies: AssetDefinition[];
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	protected options?: Record<string, unknown>;
	protected appConfig?: EcoPagesAppConfig;
	protected assetProcessingService?: AssetProcessingService;
	protected hmrManager?: IHmrManager;
	declare runtimeOrigin: string;

	get plugins(): EcoBuildPlugin[] {
		return [];
	}

	/**
	 * Returns build plugins that should only apply to browser-oriented bundles.
	 *
	 * @remarks
	 * Browser-only transforms such as runtime import aliasing belong here so they
	 * do not affect server bundles or static-page module generation.
	 */
	get browserBuildPlugins(): EcoBuildPlugin[] {
		return [];
	}

	/**
	 * Creates the integration with static declaration-only configuration.
	 *
	 * @remarks
	 * Constructors are expected to stay side-effect free. Build-manifest
	 * contributions belong in `prepareBuildContributions()` and runtime-only setup
	 * belongs in `setup()`.
	 */
	constructor(config: IntegrationPluginConfig) {
		this.name = config.name;
		this.extensions = config.extensions;
		this.integrationDependencies = config.integrationDependencies || [];
		this.staticBuildStep = config.staticBuildStep || 'render';
		this.runtimeCapability = config.runtimeCapability;
		this.jsxImportSource = config.jsxImportSource;
	}

	/**
	 * Attaches the finalized app config to the integration.
	 *
	 * Core calls this during config finalization before runtime setup so the
	 * integration can resolve asset paths and other app-owned services later.
	 */
	setConfig(appConfig: EcoPagesAppConfig): void {
		this.appConfig = appConfig;
		this.initializeAssetDefinitionService();
	}

	/**
	 * Records the runtime origin used for page-module loading and renderer setup.
	 */
	setRuntimeOrigin(runtimeOrigin: string) {
		this.runtimeOrigin = runtimeOrigin;
	}

	/**
	 * Returns an HMR strategy for this integration, if applicable.
	 * The strategy will be registered with the HmrManager during initialization.
	 *
	 * @returns HmrStrategy instance or undefined if no custom HMR handling needed
	 *
	 * @example
	 * ```typescript
	 * getHmrStrategy(): HmrStrategy {
	 *   const context = this.hmrManager!.getDefaultContext();
	 *   return new ReactHmrStrategy(context);
	 * }
	 * ```
	 */
	getHmrStrategy?(): HmrStrategy | undefined;

	/**
	 * Returns bare-specifier mappings that should be registered in the active
	 * runtime specifier registry.
	 *
	 * @remarks
	 * Integrations that own browser runtime bundles can override this to expose
	 * stable bare specifiers for client-side imports.
	 *
	 * Today these mappings are consumed by the development runtime and browser
	 * bundle aliasing path. They are intentionally generic enough to grow into a
	 * broader import-map-style facility later without moving framework-specific
	 * map contents into core.
	 */
	getRuntimeSpecifierMap(): Record<string, string> {
		return {};
	}

	/**
	 * Attaches the shared HMR manager and registers integration-owned development hooks.
	 *
	 * @remarks
	 * The default implementation registers both runtime bare-specifier mappings and
	 * the optional integration HMR strategy. Integrations should override this only
	 * when they need to extend that shared behavior rather than replace it.
	 */
	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
		hmrManager.registerSpecifierMap(this.getRuntimeSpecifierMap());

		const strategy = this.getHmrStrategy?.();
		if (strategy) {
			hmrManager.registerStrategy(strategy);
		}

		if (this.assetProcessingService) {
			this.assetProcessingService.setHmrManager(hmrManager);
		}
	}

	/**
	 * Creates the asset-processing service used for global integration dependencies.
	 */
	initializeAssetDefinitionService(): void {
		if (!this.appConfig) throw new Error(INTEGRATION_PLUGIN_ERRORS.NOT_INITIALIZED_WITH_APP_CONFIG);

		this.assetProcessingService = AssetProcessingService.createWithDefaultProcessors(this.appConfig);
		if (this.hmrManager) {
			this.assetProcessingService.setHmrManager(this.hmrManager);
		}
	}

	/**
	 * Returns processed global assets resolved during `setup()`.
	 */
	getResolvedIntegrationDependencies(): ProcessedAsset[] {
		return this.resolvedIntegrationDependencies;
	}

	/**
	 * Instantiates the integration renderer with app-owned services.
	 *
	 * @remarks
	 * Renderers are cheap runtime objects. They receive the finalized app config,
	 * a fresh asset-processing service, integration-global processed assets, and
	 * any renderer module context supplied by the active runtime.
	 */
	initializeRenderer(options?: { rendererModules?: unknown }): IntegrationRenderer<C> {
		if (!this.appConfig) {
			throw new Error(INTEGRATION_PLUGIN_ERRORS.NOT_INITIALIZED_WITH_APP_CONFIG);
		}

		const assetProcessingService = AssetProcessingService.createWithDefaultProcessors(this.appConfig);
		if (this.hmrManager) {
			assetProcessingService.setHmrManager(this.hmrManager);
		}

		const renderer = new this.renderer({
			appConfig: this.appConfig,
			assetProcessingService,
			resolvedIntegrationDependencies: this.resolvedIntegrationDependencies,
			rendererModules: options?.rendererModules,
			runtimeOrigin: this.runtimeOrigin,
		});
		renderer.name ||= this.name;

		if (this.hmrManager) {
			renderer.setHmrManager(this.hmrManager);
		}

		return renderer;
	}

	/**
	 * Prepares build-facing contributions before the app build manifest is sealed.
	 *
	 * @remarks
	 * Integrations can override this when runtime or build plugin declarations must
	 * be materialized ahead of runtime startup. Runtime-only side effects stay in
	 * `setup()`.
	 */
	async prepareBuildContributions(): Promise<void> {}

	/**
	 * Performs runtime-only integration setup after config build has already
	 * sealed manifest contributions.
	 */
	async setup(): Promise<void> {
		if (this.integrationDependencies.length === 0) return;
		if (!this.assetProcessingService) throw new Error(INTEGRATION_PLUGIN_ERRORS.NOT_INITIALIZED_WITH_ASSET_SERVICE);

		this.resolvedIntegrationDependencies = await this.assetProcessingService.processDependencies(
			this.integrationDependencies,
			this.name,
		);

		this.initializeRenderer();
	}

	/**
	 * Releases runtime resources owned by the integration.
	 *
	 * @remarks
	 * Most integrations do not need custom teardown. Override this only for
	 * explicit cleanup such as watchers, compiler handles, or runtime registries
	 * that outlive individual requests.
	 */
	async teardown(): Promise<void> {}
}
