import path from 'node:path';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import { invariant } from '@/utils/invariant';
import type { EcoPageFile, GetStaticPaths, RouteKind, Routes } from '@types';

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

  private async getStaticPathsFromDynamicRoute({
    route,
    filePath,
    getStaticPaths,
  }: {
    route: string;
    filePath: string;
    getStaticPaths: GetStaticPaths;
  }): Promise<string[]> {
    const staticPaths = await getStaticPaths();
    return staticPaths.paths.map((path) => {
      const dynamicParamsNames = this.getDynamicParamsNames(filePath);
      let routeWithParams = route;

      for (const param of dynamicParamsNames) {
        routeWithParams = routeWithParams.replace(`[${param}]`, (path.params as Record<string, string>)[param]);
      }

      return routeWithParams;
    });
  }

  private async createStaticRoutes({
    filePath,
    route,
    routePath,
    getStaticPaths,
  }: CreateRouteArgs & { getStaticPaths: GetStaticPaths }): Promise<void> {
    this.getStaticPathsFromDynamicRoute({ route, filePath, getStaticPaths })
      .then((routesWithParams) => {
        for (const routeWithParams of routesWithParams) {
          this.createRoute('dynamic', { filePath, route: routeWithParams, routePath });
        }
      })
      .catch((error) => {
        appLogger.error(error);
      });
  }

  private async handleDynamicRouteCreation({ filePath, route, routePath }: CreateRouteArgs): Promise<void> {
    const { getStaticPaths, getStaticProps }: EcoPageFile = await import(filePath);

    if (this.options.buildMode) {
      invariant(getStaticProps, `[ecopages] Missing getStaticProps in ${filePath}`);
      invariant(getStaticPaths, `[ecopages] Missing getStaticPaths in ${filePath}`);
    }

    if (getStaticPaths) {
      return this.createStaticRoutes({
        filePath,
        route,
        routePath,
        getStaticPaths,
      });
    }

    return this.createRoute('dynamic', { filePath, route, routePath });
  }

  private createRoute(kind: RouteKind, { filePath, route, routePath }: CreateRouteArgs): void {
    this.routes[route] = {
      kind,
      pathname: routePath,
      filePath,
    };
  }

  private getRouteData(file: string) {
    const routePath = this.getRoutePath(file);
    const route = `${this.origin}${routePath}`;
    const filePath = path.join(this.dir, file);
    const isCatchAll = filePath.includes('[...');
    const isDynamic = !isCatchAll && filePath.includes('[') && filePath.includes(']');
    const kind: RouteKind = isCatchAll ? 'catch-all' : isDynamic ? 'dynamic' : 'exact';

    return { route, routePath, filePath, kind };
  }

  async scan() {
    const scannedFiles = await FileUtils.glob(`**/*{${this.templatesExt.join(',')}}`, { cwd: this.dir });

    for await (const file of scannedFiles) {
      const { kind, ...routeData } = this.getRouteData(file);

      switch (kind) {
        case 'dynamic':
          await this.handleDynamicRouteCreation(routeData);
          break;
        case 'catch-all':
          if (this.options.buildMode) {
            appLogger.warn(
              'Catch-all routes are not supported in static generation, they will not be included in the bundle\n',
              `➤ ${routeData.filePath}`,
            );
          }
          this.createRoute(kind, routeData);
          break;
        default:
          this.createRoute(kind, routeData);
          break;
      }
    }

    return this.routes;
  }
}
