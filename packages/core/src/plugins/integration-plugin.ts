import type { EcoPagesAppConfig } from '../internal-types';
import type { EcoPagesElement } from '../public-types';
import type { IntegrationRenderer } from '../route-renderer/integration-renderer';
import type { AssetDependency, AssetsDependencyService } from '../services/assets-dependency.service';

export interface IntegrationPluginConfig {
  name: string;
  extensions: string[];
  dependencies?: AssetDependency[];
}

export abstract class IntegrationPlugin<C = EcoPagesElement> {
  readonly name: string;
  readonly extensions: string[];
  protected dependencies: AssetDependency[] = [];
  protected options?: Record<string, unknown>;
  protected appConfig?: EcoPagesAppConfig;
  protected assetsDependencyService?: AssetsDependencyService;

  constructor(config: IntegrationPluginConfig) {
    this.name = config.name;
    this.extensions = config.extensions;
    this.dependencies = config.dependencies || [];
  }

  setConfig(appConfig: EcoPagesAppConfig): void {
    this.appConfig = appConfig;
  }

  setDependencyService(assetsDepenencyService: AssetsDependencyService): void {
    this.assetsDependencyService = assetsDepenencyService;
  }

  getDependencies(): AssetDependency[] {
    return this.dependencies;
  }

  abstract createRenderer(): IntegrationRenderer<C>;

  async setup(): Promise<void> {}
  async teardown(): Promise<void> {}
}
