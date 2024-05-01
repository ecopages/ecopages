import type { Readable } from 'node:stream';
import { invariant } from '@/global/utils';
import { PathUtils } from '@/utils/path-utils';
import type { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import type { EcoPagesConfig, IntegrationPlugin, StaticPageContext } from '@types';
import type { IntegrationRenderer } from './integration-renderer';

export type RouteRendererOptions = {
  file: string;
} & StaticPageContext;

export type RouteRendererBody = RenderResultReadable | Readable | string;

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
  private appConfig: EcoPagesConfig;
  private integrations: IntegrationPlugin[] = [];

  constructor({ integrations, appConfig }: { integrations: IntegrationPlugin[]; appConfig: EcoPagesConfig }) {
    this.appConfig = appConfig;
    this.integrations = integrations;
  }

  createRenderer(filePath: string): RouteRenderer {
    const rendererEngine = this.getRouteRendererEngine(filePath) as new (config: EcoPagesConfig) => IntegrationRenderer;
    return new RouteRenderer(new rendererEngine(this.appConfig));
  }

  getIntegrationPlugin(filePath: string) {
    const descriptor = PathUtils.getNameDescriptor(filePath);
    const integration = this.integrations.find((integration) => integration.descriptor === descriptor);
    invariant(integration, `No integration found for descriptor: ${descriptor}, file: ${filePath}`);
    return integration;
  }

  private getRouteRendererEngine(filePath: string) {
    const integrationPlugin = this.getIntegrationPlugin(filePath);
    return integrationPlugin.renderer;
  }
}
