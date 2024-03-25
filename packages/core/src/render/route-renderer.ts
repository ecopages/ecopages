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
