import type { RenderStrategyOptions } from "@/eco-pages";
import { FSRouteScanner } from "./fs-route-scanner";

export type MatchKind = "exact" | "catch-all" | "dynamic";

export type MatchResult = {
  filePath: string;
  kind: MatchKind;
  pathname: string;
  query?: Record<string, string>;
  params?: Record<string, string | string[]>;
  strategy: RenderStrategyOptions;
};

export type Route = {
  kind: MatchKind;
  filePath: string;
  pathname: string;
  /**
   * @todo delete?
   */
  src: string;
  strategy: RenderStrategyOptions;
};

export type Routes = Record<string, Route>;

/**
 * @class FSRouter
 * @description
 * A class that manages the routes of the file system.
 * It scans the file system for files with the specified extensions and creates a map of routes.
 * It also provides a method to match a request to a route.
 * It can be used to reload the routes when the file system changes.
 */
export class FSRouter {
  dir: string;
  origin: string;
  assetPrefix: string;
  fileExtensions: string[];
  routes: Routes = {};
  onReload?: () => void;
  scanner: FSRouteScanner;

  constructor({
    dir,
    origin,
    assetPrefix,
    fileExtensions,
    scanner = FSRouteScanner,
  }: {
    dir: string;
    origin: string;
    assetPrefix: string;
    fileExtensions: string[];
    scanner?: typeof FSRouteScanner;
  }) {
    this.dir = dir;
    this.origin = origin;
    this.assetPrefix = assetPrefix;
    this.fileExtensions = fileExtensions;
    this.scanner = new scanner({
      dir: this.dir,
      pattern: `**/*{${this.fileExtensions.join(",")}}`,
      fileExtensions: this.fileExtensions,
      origin: this.origin,
    });
  }

  async init() {
    this.routes = {};
    this.routes = await this.scanner.scan();
  }

  getDynamicParams(route: Route, pathname: string): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    const routeParts = route.pathname.split("/");
    const pathnameParts = pathname.split("/");

    for (let i = 0; i < routeParts.length; i++) {
      const part = routeParts[i];
      if (part.startsWith("[") && part.endsWith("]")) {
        if (part.startsWith("[...")) {
          const param = part.slice(4, -1);
          params[param] = pathnameParts.slice(i);
          break;
        } else {
          const param = part.slice(1, -1);
          params[param] = pathnameParts[i];
        }
      }
    }
    return params;
  }

  getSearchParams(url: URL) {
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      query[key] = value;
    }
    return query;
  }

  match(req: Request): MatchResult | null {
    const url = new URL(req.url);
    const pathname = url.pathname;

    for (const route of Object.values(this.routes)) {
      if (
        route.kind === "exact" &&
        (pathname === route.pathname || pathname === route.pathname + "/")
      ) {
        return {
          filePath: route.filePath,
          kind: "exact",
          pathname: route.pathname,
          query: this.getSearchParams(url),
          strategy: route.strategy,
        };
      }
    }

    for (const route of Object.values(this.routes)) {
      const cleanPathname = route.pathname.replace(/\[.*?\]/g, "");
      const isValidDynamicRoute = pathname.includes(cleanPathname);

      if (route.kind === "dynamic" && isValidDynamicRoute) {
        const routeParts = route.pathname.split("/");
        const pathnameParts = pathname.split("/");

        if (routeParts.length === pathnameParts.length) {
          return {
            filePath: route.filePath,
            kind: "dynamic",
            pathname: route.pathname,
            query: this.getSearchParams(url),
            params: this.getDynamicParams(route, pathname),
            strategy: route.strategy,
          };
        }
      }
    }

    for (const route of Object.values(this.routes)) {
      const cleanPathname = route.pathname.replace(/\[.*?\]/g, "");
      const isValidCatchAllRoute = pathname.includes(cleanPathname);

      if (route.kind === "catch-all" && isValidCatchAllRoute) {
        return {
          filePath: route.filePath,
          kind: "catch-all",
          pathname: route.pathname,
          query: this.getSearchParams(url),
          params: this.getDynamicParams(route, pathname),
          strategy: route.strategy,
        };
      }
    }

    return null;
  }

  setOnReload(cb: () => void) {
    this.onReload = cb;
  }

  reload() {
    this.init();
    if (this.onReload) {
      this.onReload();
    }
  }
}
