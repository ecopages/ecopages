import type { Readable } from 'node:stream';
import type { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import type { IntegrationDependencyConfig } from './main/integration-manager';
import type { IntegrationRenderer } from './route-renderer/integration-renderer';
import './declarations';
import './env';

export type IntegrationPluginDependencies = BaseIntegrationPluginDependencies & SpecificIntegrationPluginDependencies;

type BaseIntegrationPluginDependencies = {
  inline?: boolean;
};

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

export type EcoPagesConfigInput = Omit<
  Partial<EcoPagesConfig>,
  'baseUrl' | 'derivedPaths' | 'templatesExt' | 'integrationsDependencies'
> &
  Pick<EcoPagesConfig, 'baseUrl' | 'rootDir'>;

export type EcoComponentDependencies = {
  stylesheets?: string[];
  scripts?: string[];
};

export type PageParams = Record<string, string | string[]>;

export type PageQuery = Record<string, string | string[]>;

export type StaticPageContext = {
  params?: PageParams;
  query?: PageQuery;
};

export interface EcoComponent<T = unknown> {
  (props: T): JSX.Element;
  dependencies?: EcoComponentDependencies;
}

export interface EcoPage<T = unknown> {
  (props: T): JSX.Element;
  dependencies?: EcoComponentDependencies;
}

export type PageProps<T = unknown> = T & StaticPageContext;

export interface PageMetadataProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  keywords?: string[];
}

export interface PageHeadProps {
  metadata: PageMetadataProps;
  dependencies?: EcoComponentDependencies;
  children?: JSX.Element;
}

export interface HtmlTemplateProps extends PageHeadProps {
  children: JSX.Element;
  language?: string;
  headContent?: JSX.Element;
}

export interface Error404TemplateProps extends Omit<HtmlTemplateProps, 'children'> {
  message: string;
  stack?: string;
}

export type StaticPath = { params: PageParams };

export type GetStaticPaths = () => Promise<{ paths: StaticPath[] }>;

export type GetMetadataContext<T = Record<string, unknown>> = Required<StaticPageContext> & { props?: T };

export type GetMetadata<T = Record<string, unknown>> = (
  context: GetMetadataContext,
) => PageMetadataProps | Promise<PageMetadataProps>;

export type GetStaticProps<T> = (context: {
  pathname: StaticPath;
}) => Promise<{ props: T }>;

export type EcoPageFile<T = unknown> = T & {
  default: EcoPage;
  getStaticPaths?: GetStaticPaths;
  getStaticProps?: GetStaticProps<Record<string, unknown>>;
  getMetadata?: GetMetadata;
};

export interface CssProcessor {
  processPath: (path: string) => Promise<string>;
  processString: (contents: string) => Promise<string>;
}

export type RouteRendererOptions = {
  file: string;
  params?: PageParams;
  query?: PageQuery;
};

export type RouteRendererBody = RenderResultReadable | Readable | string;

export type IntegrationRendererRenderOptions = RouteRendererOptions & {
  props?: Record<string, unknown>;
  metadata: PageMetadataProps;
  HtmlTemplate: EcoComponent<HtmlTemplateProps>;
  Page: EcoPage<PageProps>;
  appConfig: EcoPagesConfig;
};

export type RouteKind = 'exact' | 'catch-all' | 'dynamic';

export type MatchResult = {
  filePath: string;
  kind: RouteKind;
  pathname: string;
  query?: Record<string, string>;
  params?: Record<string, string | string[]>;
};

export type Route = {
  kind: RouteKind;
  filePath: string;
  pathname: string;
};

export type Routes = Record<string, Route>;
