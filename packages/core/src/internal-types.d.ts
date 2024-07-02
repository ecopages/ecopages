/**
 * The templates used to build the pages and loaded via the includes directory.
 */
export type IncludesTemplates = {
  head: string;
  html: string;
  seo: string;
};

export interface RobotsPreference {
  /**
   * The user agent
   * If an empty array is provided, it will enable all paths for the user agent
   * If a path is provided, it will disallow the path for the user agent
   */
  [key: string]: string[];
}

/**
 * Represents the complete configuration object for EcoPages.
 */
export type EcoPagesAppConfig = {
  /**
   * The base URL of the website, localhost or the domain
   */
  baseUrl: string;
  /**
   * The root directory of the project
   * @default "."
   */
  rootDir: string;
  /**
   * The root directory of the project
   * @default "src"
   */
  srcDir: string;
  /**
   * The directory where the public files are located
   * @default "public"
   */
  publicDir: string;
  /**
   * The directory where the pages are located
   * @default "pages"
   */
  pagesDir: string;
  /**
   * The directory where the includes templates are located
   * @default "includes"
   */
  includesDir: string;
  /**
   * The directory where the layouts are located
   * @default "layouts"
   */
  layoutsDir: string;
  /**
   * The templates used for the pages
   * @default "{head: 'head.kita.tsx', html: 'html.kita.tsx', seo: 'seo.kita.tsx'}"
   */
  includesTemplates: IncludesTemplates;
  /** Error 404 page
   * @default "404.kita.tsx"
   */
  error404Template: string;
  /**
   * The directory where the output will be located
   * @default "dist"
   */
  distDir: string;
  /**
   * The templates extensions based on the integrations
   */
  templatesExt: string[];
  /**
   * The directory where the components are located
   * @default "components"
   */
  componentsDir: string;
  /**
   * Specifies the prefix used for file extensions that indicate a script dependency of a template.
   * For example, "function.script.ts" will be identified as a dependency and built accordingly.
   * @default "script"
   */
  scriptsExtensions: string[];
  /**
   * The robots.txt configuration
   */
  robotsTxt: {
    /**
     * The robots preferences. The key is the user agent and the value is the disallowed paths.
     * @default { "*": [], Googlebot: ["/public/assets/images/"] }
     */
    preferences: RobotsPreference;
  };
  tailwind: {
    /**
     * The input file for tailwind relative to the src directory
     * @default "styles/tailwind.css"
     */
    input: string;
  };
  /**
   * @default { title: 'Eco Pages', description: 'Eco Pages' }
   */
  defaultMetadata: PageMetadataProps;
  /** Integrations plugins */
  integrations: IntegrationPlugin[];
  /** Integrations dependencies */
  integrationsDependencies: IntegrationDependencyConfig[];
  /** Derived Paths */
  absolutePaths: {
    componentsDir: string;
    distDir: string;
    includesDir: string;
    layoutsDir: string;
    pagesDir: string;
    projectDir: string;
    publicDir: string;
    srcDir: string;
    htmlTemplatePath: string;
    error404TemplatePath: string;
  };
};

/**
 * Represents the parameters for a page.
 * The keys are strings, and the values can be either a string or an array of strings.
 */
export type PageParams = Record<string, string | string[]>;

/**
 * Represents a query object for a page.
 * The keys are strings and the values can be either a string or an array of strings.
 */
export type PageQuery = Record<string, string | string[]>;

/**
 * Represents the context object for a static page.
 */
export type StaticPageContext = {
  params?: PageParams;
  query?: PageQuery;
};

/**
 * The possible kinds of a route.
 */
export type RouteKind = 'exact' | 'catch-all' | 'dynamic';

/**
 * Represents the result of a route match.
 */
export type MatchResult = {
  filePath: string;
  kind: RouteKind;
  pathname: string;
  query?: Record<string, string>;
  params?: Record<string, string | string[]>;
};

/**
 * Represents a route in EcoPages.
 */
export type Route = {
  kind: RouteKind;
  filePath: string;
  pathname: string;
};

/**
 * Represents the routes in EcoPages.
 */
export type Routes = Record<string, Route>;

/**
 * Represents the options for the file system server.
 */
export type FileSystemServerOptions = {
  watchMode: boolean;
  port?: number;
};

/**
 * Represents the file system server adapter.
 */
export interface EcoPagesFileSystemServerAdapter<ServerInstanceOptions = unknown> {
  startServer(serverOptions: ServerInstanceOptions):
    | {
        router: FSRouter;
        server: unknown;
      }
    | Promise<{ router: FSRouter; server: unknown }>;
}
