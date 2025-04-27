import type { EcoPagesAppConfig } from '../internal-types';
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
}

type RendererClass<C> = new (options: {
  appConfig: EcoPagesAppConfig;
  AssetProcessingService: AssetProcessingService;
  resolvedIntegrationDependencies: ProcessedAsset[];
}) => IntegrationRenderer<C>;

export abstract class IntegrationPlugin<C = EcoPagesElement> {
  readonly name: string;
  readonly extensions: string[];
  abstract renderer: RendererClass<C>;

  protected integrationDependencies: AssetDefinition[];
  protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
  protected options?: Record<string, unknown>;
  protected appConfig?: EcoPagesAppConfig;
  protected AssetProcessingService?: AssetProcessingService;

  constructor(config: IntegrationPluginConfig) {
    this.name = config.name;
    this.extensions = config.extensions;
    this.integrationDependencies = config.integrationDependencies || [];
  }

  setConfig(appConfig: EcoPagesAppConfig): void {
    this.appConfig = appConfig;
    this.initializeAssetDefinitionService();
  }

  initializeAssetDefinitionService(): void {
    if (!this.appConfig) throw new Error('Plugin not initialized with app config');

    this.AssetProcessingService = AssetProcessingService.createWithDefaultProcessors(this.appConfig);
  }

  getResolvedIntegrationDependencies(): ProcessedAsset[] {
    return this.resolvedIntegrationDependencies;
  }

  initializeRenderer(): IntegrationRenderer<C> {
    if (!this.appConfig) {
      throw new Error('Plugin not initialized with app config');
    }

    return new this.renderer({
      appConfig: this.appConfig,
      AssetProcessingService: AssetProcessingService.createWithDefaultProcessors(this.appConfig),
      resolvedIntegrationDependencies: this.resolvedIntegrationDependencies,
    });
  }

  async setup(): Promise<void> {
    if (this.integrationDependencies.length === 0) return;
    if (!this.AssetProcessingService) throw new Error('Plugin not initialized with asset dependency service');

    this.resolvedIntegrationDependencies = await this.AssetProcessingService.processDependencies(
      this.integrationDependencies,
      this.name,
    );

    this.initializeRenderer();
  }
  async teardown(): Promise<void> {}
}
