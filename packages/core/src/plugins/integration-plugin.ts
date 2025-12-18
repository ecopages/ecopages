import type { EcoPagesAppConfig, IHmrManager } from '../internal-types';
import type { HmrStrategy } from '../hmr/hmr-strategy';
import type { EcoPagesElement } from '../public-types';
import type { IntegrationRenderer } from '../route-renderer/integration-renderer';
import { AssetProcessingService } from '../services/asset-processing-service/asset-processing.service';
import type { AssetDefinition, ProcessedAsset } from '../services/asset-processing-service/assets.types';

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
}

type RendererClass<C> = new (options: {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	runtimeOrigin: string;
}) => IntegrationRenderer<C>;

export abstract class IntegrationPlugin<C = EcoPagesElement> {
	readonly name: string;
	readonly extensions: string[];
	abstract renderer: RendererClass<C>;
	readonly staticBuildStep: 'render' | 'fetch';

	protected integrationDependencies: AssetDefinition[];
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	protected options?: Record<string, unknown>;
	protected appConfig?: EcoPagesAppConfig;
	protected assetProcessingService?: AssetProcessingService;
	protected hmrManager?: IHmrManager;
	declare runtimeOrigin: string;

	constructor(config: IntegrationPluginConfig) {
		this.name = config.name;
		this.extensions = config.extensions;
		this.integrationDependencies = config.integrationDependencies || [];
		this.staticBuildStep = config.staticBuildStep || 'render';
	}

	setConfig(appConfig: EcoPagesAppConfig): void {
		this.appConfig = appConfig;
		this.initializeAssetDefinitionService();
	}

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

	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;

		const strategy = this.getHmrStrategy?.();
		if (strategy) {
			hmrManager.registerStrategy(strategy);
		}

		if (this.assetProcessingService) {
			this.assetProcessingService.setHmrManager(hmrManager);
		}
	}

	initializeAssetDefinitionService(): void {
		if (!this.appConfig) throw new Error('Plugin not initialized with app config');

		this.assetProcessingService = AssetProcessingService.createWithDefaultProcessors(this.appConfig);
		if (this.hmrManager) {
			this.assetProcessingService.setHmrManager(this.hmrManager);
		}
	}

	getResolvedIntegrationDependencies(): ProcessedAsset[] {
		return this.resolvedIntegrationDependencies;
	}

	initializeRenderer(): IntegrationRenderer<C> {
		if (!this.appConfig) {
			throw new Error('Plugin not initialized with app config');
		}

		const assetProcessingService = AssetProcessingService.createWithDefaultProcessors(this.appConfig);
		if (this.hmrManager) {
			assetProcessingService.setHmrManager(this.hmrManager);
		}

		const renderer = new this.renderer({
			appConfig: this.appConfig,
			assetProcessingService,
			resolvedIntegrationDependencies: this.resolvedIntegrationDependencies,
			runtimeOrigin: this.runtimeOrigin,
		});

		if (this.hmrManager) {
			renderer.setHmrManager(this.hmrManager);
		}

		return renderer;
	}

	async setup(): Promise<void> {
		if (this.integrationDependencies.length === 0) return;
		if (!this.assetProcessingService) throw new Error('Plugin not initialized with asset dependency service');

		this.resolvedIntegrationDependencies = await this.assetProcessingService.processDependencies(
			this.integrationDependencies,
			this.name,
		);

		this.initializeRenderer();
	}
	async teardown(): Promise<void> {}
}
