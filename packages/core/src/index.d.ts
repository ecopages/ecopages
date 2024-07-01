import type { Readable } from 'node:stream';
import type { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import type { IntegrationDependencyConfig } from './main/integration-manager';
import type { IntegrationRenderer } from './route-renderer/integration-renderer';
import type { FSRouter } from './router/fs-router';

/**
 * Represents the dependencies required for an integration plugin.
 * It combines the base integration plugin dependencies with specific integration plugin dependencies.
 */
export type IntegrationPluginDependencies = BaseIntegrationPluginDependencies & SpecificIntegrationPluginDependencies;

type BaseIntegrationPluginDependencies = {
  inline?: boolean;
};

/**
 * Represents the dependencies required for a specific integration plugin.
 * It can be one of the following types:
 * - `ScriptImportIntegrationPluginDependencies`
 * - `ScriptContentIntegrationPluginDependencies`
 * - `StylesheetImportIntegrationPluginDependencies`
 * - `StylesheetContentIntegrationPluginDependencies`
 */
type SpecificIntegrationPluginDependencies =
  | ScriptImportIntegrationPluginDependencies
  | ScriptContentIntegrationPluginDependencies
  | StylesheetImportIntegrationPluginDependencies
  | StylesheetContentIntegrationPluginDependencies;

type ScriptImportIntegrationPluginDependencies = {
  kind: 'script';
  importPath: string;
  position?: 'head' | 'body';
};

type ScriptContentIntegrationPluginDependencies = {
  kind: 'script';
  content: string;
  position?: 'head' | 'body';
};

type StylesheetImportIntegrationPluginDependencies = {
  kind: 'stylesheet';
  importPath: string;
};

type StylesheetContentIntegrationPluginDependencies = {
  kind: 'stylesheet';
  content: string;
};

export type IntegrationPlugin = {
  name: string;
  extensions: string[];
  renderer: typeof IntegrationRenderer;
  dependencies?: IntegrationPluginDependencies[];
};

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
export type EcoPagesConfig = {
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
 * Represents the input configuration for EcoPages.
 */
export type EcoPagesConfigInput = Omit<
  Partial<EcoPagesConfig>,
  'baseUrl' | 'derivedPaths' | 'templatesExt' | 'integrationsDependencies'
> &
  Pick<EcoPagesConfig, 'baseUrl' | 'rootDir'>;

/**
 * Represents the dependencies for an EcoComponent.
 */
export type EcoComponentDependencies = {
  stylesheets?: string[];
  scripts?: string[];
  components?: (EcoComponent | { config: EcoComponentConfig })[];
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
 * Configuration object for an EcoComponent.
 */
export type EcoComponentConfig = {
  importMeta: ImportMeta;
  dependencies?: EcoComponentDependencies;
};

/**
 * Represents an EcoComponent.
 *
 * @template T - The type of the props object.
 */
export interface EcoComponent<T = any> {
  /**
   * Renders the component with the given props.
   *
   * @param props - The props object.
   * @returns The rendered JSX element.
   */
  (props: T): JSX.Element;

  /**
   * The configuration options for the EcoComponent.
   */
  config?: EcoComponentConfig;
}

/**
 * Represents an EcoPage component.
 * @template T - The type of props that the component accepts.
 */
export interface EcoPage<T = any> {
  /**
   * Renders the EcoPage component.
   * @param props - The props to be passed to the component.
   * @returns The rendered JSX element.
   */
  (props: T): JSX.Element;

  /**
   * The configuration options for the EcoPage component.
   */
  config?: EcoComponentConfig;
}

/**
 * Represents a page in EcoPages.
 */
export type PageProps<T = unknown> = T & StaticPageContext;

/**
 * Represents the metadata for a page.
 */
export interface PageMetadataProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  keywords?: string[];
}

/**
 * Represents the props for the head of a page.
 */
export interface PageHeadProps {
  metadata: PageMetadataProps;
  dependencies?: EcoComponentDependencies;
  children?: JSX.Element;
}

/**
 * Represents the props for the HTML template of a page.
 */
export interface HtmlTemplateProps extends PageHeadProps {
  children: JSX.Element;
  language?: string;
  headContent?: JSX.Element;
}

/**
 * Represents the props for the error 404 template.
 */
export interface Error404TemplateProps extends Omit<HtmlTemplateProps, 'children'> {
  message: string;
  stack?: string;
}

/**
 * Represents the params for a static path.
 */
export type StaticPath = { params: PageParams };

/**
 * The function that returns the static paths for a page.
 */
export type GetStaticPaths = () => Promise<{ paths: StaticPath[] }>;

/**
 * The context object for the getMetadata function.
 */
export type GetMetadataContext<T = Record<string, unknown>> = Required<StaticPageContext> & {
  props: T;
};

/**
 * The function that returns the metadata for a page.
 */
export type GetMetadata<T = Record<string, unknown>> = (
  context: GetMetadataContext<T>,
) => PageMetadataProps | Promise<PageMetadataProps>;

/**
 * The function that returns the static props for a page.
 */
export type GetStaticProps<T> = (context: { pathname: StaticPath }) => Promise<{ props: T }>;

/**
 * Represents a page file in EcoPages.
 * @template T - The type of the page props.
 */
export type EcoPageFile<T = unknown> = T & {
  default: EcoPage;
  getStaticPaths?: GetStaticPaths;
  getStaticProps?: GetStaticProps<Record<string, unknown>>;
  getMetadata?: GetMetadata;
};

/**
 * Represents a CSS processor.
 */
export interface CssProcessor {
  /**
   * Processes a CSS file at the specified path.
   * @param path - The path to the CSS file.
   * @param plugins - Optional plugins to be used during processing.
   * @returns A promise that resolves to the processed CSS as a string.
   */
  processPath: (path: string, plugins?: any) => Promise<string>;

  /**
   * Processes a CSS string or buffer.
   * @param contents - The CSS contents as a string or buffer.
   * @param plugins - Optional plugins to be used during processing.
   * @returns A promise that resolves to the processed CSS as a string.
   */
  processStringOrBuffer: (contents: string | Buffer, plugins?: unknown) => Promise<string>;
}

/**
 * The options for the route renderer.
 */
export type RouteRendererOptions = {
  file: string;
  params?: PageParams;
  query?: PageQuery;
};

/**
 * The body of the route renderer.
 */
export type RouteRendererBody = RenderResultReadable | Readable | string;

/**
 * The options for the integration renderer.
 */
export type IntegrationRendererRenderOptions = RouteRendererOptions & {
  props?: Record<string, unknown>;
  metadata: PageMetadataProps;
  HtmlTemplate: EcoComponent<HtmlTemplateProps>;
  Page: EcoPage<PageProps>;
  dependencies?: EcoComponentDependencies;
  appConfig: EcoPagesConfig;
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
