import path from 'node:path';
import type { EcoPageFile, GetStaticPaths } from '@/eco-pages';
import { FileUtils } from '@/utils/file-utils.module';
import type { Routes } from './fs-router';

type CreateRouteArgs = {
  routePath: string;
  filePath: string;
  route: string;
};

type FSRouterScannerOptions = {
  buildMode: boolean;
};

/**
 * @class FSRouterScanner
 * @description
 * This class is responsible for scanning the file system for routes.
 * It uses the glob package to scan the file system for files with the specified file extensions.
 * It then creates a map of the routes with the pathname as the key.
 * The pathname is the route without the file extension.
 * For example, if the file is "index.tsx", the pathname will be "/index".
 * If the file is "blog/[slug].tsx", the pathname will be "/blog/[slug]".
 * If the file is "blog/[...slug].tsx", the pathname will be "/blog/[...slug]".
 */
export class FSRouterScanner {
  private dir: string;
  private origin = '';
  private templatesExt: string[];
  private options: FSRouterScannerOptions;
  routes: Routes = {};

  constructor({
    dir,
    origin,
    templatesExt,
    options,
  }: {
    dir: string;
    origin: string;
    templatesExt: string[];
    options: FSRouterScannerOptions;
  }) {
    this.dir = dir;
    this.origin = origin;
    this.templatesExt = templatesExt;
    this.options = options;
  }

  private getGlobTemplatePattern() {
    return `**/*{${this.templatesExt.join(',')}}`;
  }

  private getRoutePath(path: string): string {
    const cleanedRoute = this.templatesExt
      .reduce((route, ext) => route.replace(ext, ''), path)
      .replace(/\/?index$/, '');
    return `/${cleanedRoute}`;
  }

  private getDynamicParamsNames(route: string): string[] {
    const matches = route.match(/\[.*?\]/g);
    return matches ? matches.map((match) => match.slice(1, -1)) : [];
  }

  private async createStaticDynamicRoute({
    filePath,
    route,
    routePath,
    getStaticPaths,
  }: CreateRouteArgs & { getStaticPaths: GetStaticPaths }): Promise<void> {
    const staticPaths = await getStaticPaths();

    const dynamicParamsNames = this.getDynamicParamsNames(route);

    const routesWithParams = staticPaths.paths.map((path) => {
      let routeWithParams = route;

      for (const param of dynamicParamsNames) {
        routeWithParams = routeWithParams.replace(`[${param}]`, (path.params as Record<string, string>)[param]);
      }

      return routeWithParams;
    });

    for (const routeWithParams of routesWithParams) {
      this.routes[routeWithParams] = {
        kind: 'dynamic',
        src: routeWithParams,
        pathname: routePath,
        filePath,
      };
    }
  }

  private createSSRDynamicRoute({ filePath, route, routePath }: CreateRouteArgs): void {
    this.routes[route] = {
      kind: 'dynamic',
      src: `${this.origin}${routePath}`,
      pathname: routePath,
      filePath,
    };
  }

  private async createDynamicRoute({ filePath, route, routePath }: CreateRouteArgs): Promise<void> {
    const { getStaticPaths, getStaticProps } = (await import(filePath)) as EcoPageFile;

    if (this.options.buildMode && !getStaticProps) throw new Error(`[eco-pages] Missing getStaticProps in ${filePath}`);
    if (this.options.buildMode && !getStaticPaths) throw new Error(`[eco-pages] Missing getStaticPaths in ${filePath}`);

    if (getStaticPaths) {
      return this.createStaticDynamicRoute({
        filePath,
        route,
        routePath,
        getStaticPaths: getStaticPaths as GetStaticPaths,
      });
    }

    return this.createSSRDynamicRoute({ filePath, route, routePath });
  }

  private createCatchAllRoute({ filePath, route, routePath }: CreateRouteArgs): void {
    this.routes[route] = {
      kind: 'catch-all',
      src: `${this.origin}${routePath}`,
      pathname: routePath,
      filePath,
    };
  }

  private async createExactRoute({ filePath, route, routePath }: CreateRouteArgs): Promise<void> {
    this.routes[route] = {
      kind: 'exact',
      src: `${this.origin}${routePath}`,
      pathname: routePath,
      filePath,
    };
  }

  private getRouteData(file: string) {
    const routePath = this.getRoutePath(file);
    const route = `${this.origin}${routePath}`;
    const filePath = path.join(this.dir, file);
    const isDynamic = filePath.includes('[') && filePath.includes(']');
    const isCatchAll = filePath.includes('[...');

    return { route, routePath, filePath, isDynamic, isCatchAll };
  }

  async scan() {
    const scannedFiles = await FileUtils.glob(this.getGlobTemplatePattern(), { cwd: this.dir });

    for await (const file of scannedFiles) {
      const { isCatchAll, isDynamic, ...routeData } = this.getRouteData(file);

      switch (true) {
        case isCatchAll:
          this.createCatchAllRoute(routeData);
          break;
        case isDynamic:
          await this.createDynamicRoute(routeData);
          break;
        default:
          await this.createExactRoute(routeData);
          break;
      }
    }

    return this.routes;
  }
}
