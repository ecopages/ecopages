import path from "path";

type MatchKind = "exact" | "catch-all" | "dynamic";

type MatchResult = {
  filePath: string;
  kind: MatchKind;
  pathname: string;
  query?: Record<string, string>;
  params?: Record<string, string | string[]>;
};

type Route = {
  kind: MatchKind;
  filePath: string;
  pathname: string;
  src: string;
};

/**
 * @class FSRouter
 * @description
 * This class is responsible for handling the file system routes.
 * Please remember to call the init method before using the class.
 * It scans the file system for files with the specified file extensions.
 * It then creates a map of the routes with the pathname as the key.
 */
export class FSRouter {
  dir: string;
  origin: string;
  assetPrefix: string;
  fileExtensions: string[];
  routes: Record<string, Route> = {};

  constructor({
    dir,
    origin,
    assetPrefix,
    fileExtensions,
  }: {
    dir: string;
    origin: string;
    assetPrefix: string;
    fileExtensions: string[];
  }) {
    this.dir = dir;
    this.origin = origin;
    this.assetPrefix = assetPrefix;
    this.fileExtensions = fileExtensions;
  }

  async init() {
    await this.getRoutes();
  }

  async getRoutes() {
    const pattern = `**/*{${this.fileExtensions.join(",")}}`;
    const glob = new Bun.Glob(pattern);

    const scannedFiles = await Array.fromAsync(glob.scan({ cwd: this.dir }));

    for (const file of scannedFiles) {
      const routePath = this.getRoutePathname(file);
      const route = path.join(this.origin, routePath);
      const filePath = path.join(this.dir, file);
      const isDynamic = route.includes("[") && route.includes("]");
      const isCatchAll = route.includes("[...");

      let routeInfo: Route;

      if (isCatchAll) {
        routeInfo = {
          kind: "catch-all",
          filePath,
          src: path.join(this.origin, file),
          pathname: routePath,
        };
      } else if (isDynamic) {
        routeInfo = {
          kind: "dynamic",
          filePath,
          src: path.join(this.origin, file),
          pathname: routePath,
        };
      } else {
        routeInfo = {
          kind: "exact",
          src: path.join(this.origin, file),
          pathname: routePath,
          filePath,
        };
      }

      this.routes[route] = routeInfo;
    }
  }

  getRoutePathname(route: string) {
    const fileExtensionsSet = new Set(this.fileExtensions);
    let cleanedRoute = route;

    for (const ext of fileExtensionsSet) {
      cleanedRoute = cleanedRoute.replace(ext, "");
    }

    cleanedRoute = cleanedRoute.replace(/\/?index$/, "");
    return `/${cleanedRoute}`;
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
        };
      }
    }

    return null;
  }

  reload() {
    this.routes = {};
    this.getRoutes();
  }
}
