import type { AssetDependency, ProcessedAsset } from '../services/assets-dependency-service/assets.types';
import type { EcoPagesAppConfig } from '../internal-types';
import type { EcoPagesElement } from '../public-types';
import type { IntegrationRenderer } from '../route-renderer/integration-renderer';
import { AssetsDependencyService } from '../services/assets-dependency-service/assets-dependency.service';
import { HtmlTransformerService } from 'src/services/html-transformer.service';

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
  integrationDependencies?: AssetDependency[];
}

type RendererClass<C> = new (options: {
  appConfig: EcoPagesAppConfig;
  assetsDependencyService: AssetsDependencyService;
  resolvedIntegrationDependencies: ProcessedAsset[];
}) => IntegrationRenderer<C>;

export abstract class IntegrationPlugin<C = EcoPagesElement> {
  readonly name: string;
  readonly extensions: string[];
  abstract renderer: RendererClass<C>;

  protected integrationDependencies: AssetDependency[];
  protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
  protected options?: Record<string, unknown>;
  protected appConfig?: EcoPagesAppConfig;
  protected assetsDependencyService?: AssetsDependencyService;

  constructor(config: IntegrationPluginConfig) {
    this.name = config.name;
    this.extensions = config.extensions;
    this.integrationDependencies = config.integrationDependencies || [];
  }

  setConfig(appConfig: EcoPagesAppConfig): void {
    this.appConfig = appConfig;
    this.initializeAssetDependencyService();
  }

  initializeAssetDependencyService(): void {
    if (!this.appConfig) throw new Error('Plugin not initialized with app config');

    this.assetsDependencyService = AssetsDependencyService.createWithDefaultProcessors(this.appConfig);
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
      assetsDependencyService: AssetsDependencyService.createWithDefaultProcessors(this.appConfig),
      resolvedIntegrationDependencies: this.resolvedIntegrationDependencies,
    });
  }

  async setup(): Promise<void> {
    if (this.integrationDependencies.length === 0) return;
    if (!this.assetsDependencyService) throw new Error('Plugin not initialized with asset dependency service');

    this.resolvedIntegrationDependencies = await this.assetsDependencyService.processDependencies(
      this.integrationDependencies,
      this.name,
    );

    this.initializeRenderer();
  }
  async teardown(): Promise<void> {}
}
