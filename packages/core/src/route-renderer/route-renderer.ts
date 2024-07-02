import type { EcoPagesAppConfig, IntegrationPlugin } from '@/internal-types';
import type { RouteRendererBody, RouteRendererOptions } from '@/public-types';
import { invariant } from '../utils/invariant';
import { PathUtils } from '../utils/path-utils';
import type { IntegrationRenderer } from './integration-renderer';

export class RouteRenderer {
  private renderer: IntegrationRenderer;

  constructor(renderer: IntegrationRenderer) {
    this.renderer = renderer;
  }

  async createRoute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    return this.renderer.execute(options);
  }
}

export class RouteRendererFactory {
  private appConfig: EcoPagesAppConfig;
  private integrations: IntegrationPlugin[] = [];

  constructor({ integrations, appConfig }: { integrations: IntegrationPlugin[]; appConfig: EcoPagesAppConfig }) {
    this.appConfig = appConfig;
    this.integrations = integrations;
  }

  createRenderer(filePath: string): RouteRenderer {
    const rendererEngine = this.getRouteRendererEngine(filePath) as new (
      config: EcoPagesAppConfig,
    ) => IntegrationRenderer;
    return new RouteRenderer(new rendererEngine(this.appConfig));
  }

  getIntegrationPlugin(filePath: string): IntegrationPlugin {
    const templateExtension = PathUtils.getEcoTemplateExtension(filePath);
    const integration = this.integrations.find((integration) => integration.extensions.includes(templateExtension));
    invariant(integration, `No integration found for template extension: ${templateExtension}, file: ${filePath}`);
    return integration;
  }

  private getRouteRendererEngine(filePath: string): typeof IntegrationRenderer {
    const integrationPlugin = this.getIntegrationPlugin(filePath);
    return integrationPlugin.renderer;
  }
}
