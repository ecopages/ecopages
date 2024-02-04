import type { RobotsPreference } from "./scripts/robots/generate-robots-txt";

export type EcoPagesConfig = {
  /**
   * The base URL of the website, localhost or the domain
   */
  baseUrl: string;
  /**
   * The root directory of the project
   * @default "src"
   */
  rootDir: string;
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
   * The robots.txt configuration
   */
  robotsTxt: {
    /**
     * The robots preferences. The key is the user agent and the value is the disallowed paths.
     * @default { "*": [], Googlebot: ["/public/assets/images/"] }
     */
    preferences: RobotsPreference;
  };
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
}

export const defaultTemplateFormats = {
  kita: "kita",
} as const;

export type DefaultTemplateFormats = keyof typeof defaultTemplateFormats;

export type RenderRouteOptions = {
  file: string;
  pagesDir: string;
};

export type RenderRouteConfig = {
  path: string;
  html: JSX.Element;
};
