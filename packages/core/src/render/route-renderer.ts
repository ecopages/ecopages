import type { DefaultTemplateEngines } from "@/eco-pages";
import { KitaRenderer } from "./strategies/kita-rendererer";
import { pathAnalyser } from "@/utils/path-analyser";

export type RouteRendererOptions = {
  file: string;
  params?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
};

export type RouteRendererConfig = {
  path: string;
  html: JSX.Element;
};

export interface IRouteRenderer {
  render: (options: RouteRendererOptions) => Promise<RouteRendererConfig>;
}

export class RouteRenderer {
  private renderer: IRouteRenderer;

  constructor(renderer: IRouteRenderer) {
    this.renderer = renderer;
  }

  async createRoute(options: RouteRendererOptions): Promise<RouteRendererConfig> {
    return this.renderer.render(options);
  }
}

export class RouteRendererFactory {
  createRenderer(filePath: string): RouteRenderer {
    const rendererEngine = this.getRouteRendererEngine(filePath);
    return new RouteRenderer(new rendererEngine());
  }

  private getRouteRendererEngine(filePath: string) {
    const { descriptor } = pathAnalyser(filePath);

    switch (descriptor as DefaultTemplateEngines) {
      case "kita": {
        return KitaRenderer;
      }
      default:
        throw new Error(`[eco-pages] Unknown render type: ${descriptor} for file: ${filePath}`);
    }
  }
}
