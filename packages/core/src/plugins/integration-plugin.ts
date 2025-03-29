import type { IntegrationRenderer } from 'src/route-renderer/integration-renderer';
import type { Dependency } from 'src/services/dependency.service';
import type { EcoPagesAppConfig } from '../internal-types';

export interface IntegrationPluginConfig {
  name: string;
  extensions: string[];
  dependencies?: Dependency[];
}

export abstract class IntegrationPlugin {
  readonly name: string;
  readonly extensions: string[];
  protected dependencies: Dependency[] = [];
  protected options?: Record<string, unknown>;
  protected appConfig?: EcoPagesAppConfig;

  constructor(config: IntegrationPluginConfig) {
    this.name = config.name;
    this.extensions = config.extensions;
    this.dependencies = config.dependencies || [];
  }

  setConfig(appConfig: EcoPagesAppConfig): void {
    this.appConfig = appConfig;
  }

  getDependencies(): Dependency[] {
    return this.dependencies;
  }

  abstract createRenderer(): IntegrationRenderer;

  async setup(): Promise<void> {}
  async teardown(): Promise<void> {}
}
