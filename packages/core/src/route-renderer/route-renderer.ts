import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { RouteRendererBody, RouteRendererOptions } from '../public-types.ts';
import { invariant } from '../utils/invariant.ts';
import { PathUtils } from '../utils/path-utils.module.ts';
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
    const integrationRenderer = this.getRouteRendererEngine(filePath);
    invariant(integrationRenderer, `No integration renderer found for file: ${filePath}`);
    return new RouteRenderer(integrationRenderer);
  }

  getIntegrationPlugin(filePath: string): IntegrationPlugin {
    const templateExtension = PathUtils.getEcoTemplateExtension(filePath);
    const isIntegrationPlugin = (plugin: IntegrationPlugin): boolean => {
      return plugin.extensions.some((extension) => templateExtension === extension);
    };
    const integrationPlugin = this.appConfig.integrations.find(isIntegrationPlugin);
    invariant(
      integrationPlugin,
      `No integration plugin found for template extension: ${templateExtension}, file: ${filePath}`,
    );
    return integrationPlugin;
  }

  private getRouteRendererEngine(filePath: string): IntegrationRenderer {
    const integrationPlugin = this.getIntegrationPlugin(filePath);
    return integrationPlugin.initializeRenderer();
  }
}
