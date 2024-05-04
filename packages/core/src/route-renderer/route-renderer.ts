import type { Readable } from 'node:stream';
import { invariant } from '@/global/utils';
import { PathUtils } from '@/utils/path-utils';
import type { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import type { EcoPagesConfig, IntegrationPlugin, RouteRendererOptions } from '@types';
import type { ReactDOMServerReadableStream } from 'react-dom/server';
import type { IntegrationRenderer } from './integration-renderer';

export type RouteRendererBody = ReactDOMServerReadableStream | RenderResultReadable | Readable | string;

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
    const templateExtension = PathUtils.getEcoTemplateExtension(filePath);
    const integration = this.integrations.find((integration) => integration.extensions.includes(templateExtension));
    invariant(integration, `No integration found for template extension: ${templateExtension}, file: ${filePath}`);
    return integration;
  }

  private getRouteRendererEngine(filePath: string) {
    const integrationPlugin = this.getIntegrationPlugin(filePath);
    return integrationPlugin.renderer;
  }
}
