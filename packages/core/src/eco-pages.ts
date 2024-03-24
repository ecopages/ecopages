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
   * The directory where the external files are located
   * @default "externals"
   */
  externalsDir: string;
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
   * The prefix for the extensions that identifies a script that is a dependency of a template
   * i.e. function.script.ts > will be recognised as a dependency and built accordingly
   * @default "script"
   */
  dependencyExtPrefix: string;
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
};

export type EcoPagesConfigInput = Omit<Partial<EcoPagesConfig>, "baseUrl"> &
  Pick<EcoPagesConfig, "baseUrl">;

export type EcoComponentDependencies = {
  stylesheets?: string[];
  scripts?: string[];
};

export interface EcoComponent<T = {}> {
  (props: T): JSX.Element;
  dependencies?: EcoComponentDependencies;
  strategy?: "client" | "ssr" | "suspense";
}

export type PageProps<T = unknown> = T & {
  params: Record<string, string>;
  query: Record<string, string>;
};

export const defaultTemplateEngines = {
  kita: "kita",
} as const;

export type DefaultTemplateEngines = keyof typeof defaultTemplateEngines;

export type RenderRouteOptions = {
  file: string;
  config: EcoPagesConfig;
  params?: Record<string, string | string[]>;
  query?: Record<string, string>;
};

export type RenderRouteConfig = {
  path: string;
  html: JSX.Element;
  strategy?: "client" | "ssr" | "suspense";
};

export interface PageMetadataProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  keywords?: string[];
}

export type StaticPath = { params: Record<string, string> };

export type GetStaticPaths = () => Promise<{ paths: StaticPath[] }>;

export type GetStaticProps<T> = (context: {
  pathname: StaticPath;
}) => Promise<{ props: T; metadata?: PageMetadataProps }>;
