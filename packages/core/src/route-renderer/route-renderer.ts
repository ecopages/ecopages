import type { Readable } from 'node:stream';
import type { EcoConfigIntegrationPlugins } from '@/eco-pages';
import { invariant } from '@/global/utils';
import type { IntegrationPlugin } from '@/integrations/registerIntegration';
import { PathUtils } from '@/utils/path-utils';
import type { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import type { IntegrationRenderer } from './integration-renderer';

export type RouteRendererOptions = {
  file: string;
  params?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
};

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
  private integrations: EcoConfigIntegrationPlugins;

  constructor({ integrations }: { integrations: EcoConfigIntegrationPlugins }) {
    this.integrations = integrations;
  }

  createRenderer(filePath: string): RouteRenderer {
    const rendererEngine = this.getRouteRendererEngine(filePath);
    return new RouteRenderer(new rendererEngine());
  }

  private getRouteRendererEngine(filePath: string) {
    const descriptor = PathUtils.getNameDescriptor(filePath);

    const integrationPlugin = this.integrations[descriptor as keyof EcoConfigIntegrationPlugins] as IntegrationPlugin;

    invariant(integrationPlugin, `[eco-pages] No renderer found for file: ${filePath}`);

    return integrationPlugin.renderer;
  }
}
