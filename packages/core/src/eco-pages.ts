import type { RobotsPreference } from "./scripts/robots/generate-robots-txt";

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
   * The directory where the global components are located
   * @default "global"
   */
  globalDir: string;
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
  includesTemplates: {
    head: string;
    html: string;
    seo: string;
    error404: string;
  };
  /**
   * The directory where the output will be located
   * @default "dist"
   */
  distDir: string;
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
  scriptDescriptor: string;
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
  /**
   * The TypeScript aliases
   */
  tsAliases: {
    baseUrl: string;
    paths: Record<string, string[]>;
  };
  /**
   * The external dependencies
   */
  externalDeps: string[];
  /**
   * The watch mode
   */
  watchMode: boolean;
  /** Derived Paths */
  derivedPaths: {
    componentsDir: string;
    globalDir: string;
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

export type EcoPagesConfigInput = Omit<Partial<EcoPagesConfig>, "baseUrl" | "derivedPaths"> &
  Pick<EcoPagesConfig, "baseUrl">;

export type EcoComponentDependencies = {
  stylesheets?: string[];
  scripts?: string[];
};

export type RenderStrategyOptions = "ssr" | "static" | "isg";
export interface EcoComponent<T = {}> {
  (props: T): JSX.Element;
  dependencies?: EcoComponentDependencies;
}

export interface EcoPage<T = {}> {
  (props: T): JSX.Element;
  dependencies?: EcoComponentDependencies;
  renderStrategy?: RenderStrategyOptions;
}

export type PageProps<T = unknown> = T & {
  params: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
};

export const defaultTemplateEngines = {
  kita: "kita",
} as const;

export type DefaultTemplateEngines = keyof typeof defaultTemplateEngines;

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
  children?: Html.Children;
}

export interface HtmlTemplateProps extends PageHeadProps {
  children: Html.Children;
  language?: string;
  headContent?: Html.Children;
}

export interface Error404TemplateProps extends Omit<HtmlTemplateProps, "children"> {
  message: string;
  stack?: string;
}

export type StaticPath = { params: Record<string, string | string[]> };

export type GetStaticPaths = () => Promise<{ paths: StaticPath[] }>;

export type GetMetadata<T = Record<string, unknown>> = (
  context: PageProps<T>
) => PageMetadataProps | Promise<PageMetadataProps>;

export type GetStaticProps<T> = (context: {
  pathname: StaticPath;
}) => Promise<{ props: T; metadata?: PageMetadataProps }>;

export type EcoPageFile = {
  default: EcoPage;
  getStaticPaths?: GetStaticPaths;
  getStaticProps?: GetStaticProps<unknown>;
  getMetadata?: GetMetadata;
};
