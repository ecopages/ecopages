import type { DefaultTemplateEngines, defaultTemplateEngines } from "@/eco-pages";
import { KitaRenderer } from "./renderers/kita-renderer";
import { PathUtils } from "@/utils/path-utils";
import { LitRenderer } from "./renderers/lit-renderer";
import type { AbstractRenderer } from "./renderers/abstract-renderer";
import type { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable";
import { Readable } from "stream";

export type RouteRendererOptions = {
  file: string;
  params?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
};

export type RouteRendererBody = RenderResultReadable | Readable | string;

export class RouteRenderer {
  private renderer: AbstractRenderer;

  constructor(renderer: AbstractRenderer) {
    this.renderer = renderer;
  }

  async createRoute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    return this.renderer.execute(options);
  }
}

export class RouteRendererFactory {
  createRenderer(filePath: string): RouteRenderer {
    const rendererEngine = this.getRouteRendererEngine(filePath);
    return new RouteRenderer(new rendererEngine());
  }

  private getRouteRendererEngine(filePath: string) {
    const descriptor = PathUtils.getNameDescriptor(filePath);

    switch (descriptor as DefaultTemplateEngines) {
      case "kita":
        return KitaRenderer;
      case "lit":
        return LitRenderer;
      default:
        throw new Error(`[eco-pages] Unknown render type: ${descriptor} for file: ${filePath}`);
    }
  }
}
