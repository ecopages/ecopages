import type { EcoPagesElement } from 'src/public-types';
import type { EcoPagesAppConfig } from '../internal-types';
import type { IntegrationRenderer } from '../route-renderer/integration-renderer';
import type { Dependency, DependencyService } from '../services/dependency.service';

export interface IntegrationPluginConfig {
  name: string;
  extensions: string[];
  dependencies?: Dependency[];
}

export abstract class IntegrationPlugin<C = EcoPagesElement> {
  readonly name: string;
  readonly extensions: string[];
  protected dependencies: Dependency[] = [];
  protected options?: Record<string, unknown>;
  protected appConfig?: EcoPagesAppConfig;
  protected dependencyService?: DependencyService;

  constructor(config: IntegrationPluginConfig) {
    this.name = config.name;
    this.extensions = config.extensions;
    this.dependencies = config.dependencies || [];
  }

  setConfig(appConfig: EcoPagesAppConfig): void {
    this.appConfig = appConfig;
  }

  setDependencyService(dependencyService: DependencyService): void {
    this.dependencyService = dependencyService;
  }

  getDependencies(): Dependency[] {
    return this.dependencies;
  }

  abstract createRenderer(): IntegrationRenderer<C>;

  async setup(): Promise<void> {}
  async teardown(): Promise<void> {}
}
