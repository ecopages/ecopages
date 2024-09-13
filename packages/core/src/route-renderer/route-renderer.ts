import type { IntegrationManager } from 'src/main/integration-manager.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { IntegrationPlugin, RouteRendererBody, RouteRendererOptions } from '../public-types.ts';
import { invariant } from '../utils/invariant.ts';
import { PathUtils } from '../utils/path-utils.ts';
import type { IntegrationRenderer } from './integration-renderer.ts';

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

  constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
    this.appConfig = appConfig;
  }

  createRenderer(filePath: string): RouteRenderer {
    const rendererEngine = this.getRouteRendererEngine(filePath) as new (options: {
      appConfig: EcoPagesAppConfig;
    }) => IntegrationRenderer;

    const renderer = new rendererEngine({
      appConfig: this.appConfig,
    });

    return new RouteRenderer(renderer);
  }

  getIntegrationPlugin(filePath: string): IntegrationPlugin {
    const templateExtension = PathUtils.getEcoTemplateExtension(filePath);
    const integration = this.appConfig.integrations.find((integration) =>
      integration.extensions.includes(templateExtension),
    );
    invariant(integration, `No integration found for template extension: ${templateExtension}, file: ${filePath}`);
    return integration;
  }

  private getRouteRendererEngine(filePath: string): typeof IntegrationRenderer {
    const integrationPlugin = this.getIntegrationPlugin(filePath);
    return integrationPlugin.renderer;
  }
}
