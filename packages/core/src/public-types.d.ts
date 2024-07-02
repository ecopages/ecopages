import type { Readable } from 'node:stream';
import type { RenderResultReadable } from '@lit-labs/ssr/lib/render-result-readable';
import type { IntegrationDependencyConfig } from './main/integration-manager';
import type { IntegrationRenderer } from './route-renderer/integration-renderer';
import type { FSRouter } from './router/fs-router';

/**
 * Represents the dependencies for an EcoComponent.
 */
export type EcoComponentDependencies = {
  stylesheets?: string[];
  scripts?: string[];
  components?: (EcoComponent | EcoWebComponent)[];
};

/**
 * Represents the input configuration for EcoPages.
 */
export type EcoPagesConfig = Omit<
  Partial<EcoPagesConfig>,
  'baseUrl' | 'derivedPaths' | 'templatesExt' | 'integrationsDependencies'
> &
  Pick<EcoPagesConfig, 'baseUrl' | 'rootDir'>;

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
export type EcoComponent<T = any> = {
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
};

/**
 * Represents an EcoComponent. It doesn't have a render function.
 *
 * @template T - The type of the props object.
 */
export type EcoWebComponent<T = any> = {
  /**
   * The configuration options for the EcoComponent.
   */
  config?: EcoComponentConfig;
};

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
   * @returns A promise that resolves to the processed CSS as a string.
   */
  processPath: (path: string) => Promise<string>;

  /**
   * Processes a CSS string or buffer.
   * @param contents - The CSS contents as a string or buffer.
   * @returns A promise that resolves to the processed CSS as a string.
   */
  processStringOrBuffer: (contents: string | Buffer) => Promise<string>;
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
 * {@link ScriptImportIntegrationPluginDependencies}
 * {@link ScriptContentIntegrationPluginDependencies}
 * {@link StylesheetImportIntegrationPluginDependencies}
 * {@link StylesheetContentIntegrationPluginDependencies}
 */
type SpecificIntegrationPluginDependencies =
  | ScriptImportIntegrationPluginDependencies
  | ScriptContentIntegrationPluginDependencies
  | StylesheetImportIntegrationPluginDependencies
  | StylesheetContentIntegrationPluginDependencies;

/**
 * Script dependencies for an integration plugin with an import path.
 */
type ScriptImportIntegrationPluginDependencies = {
  kind: 'script';
  importPath: string;
  position?: 'head' | 'body';
};

/**
 * Script dependencies for an integration plugin with content.
 */
type ScriptContentIntegrationPluginDependencies = {
  kind: 'script';
  content: string;
  position?: 'head' | 'body';
};

/**
 * Stylesheet dependencies for an integration plugin with an import path.
 */
type StylesheetImportIntegrationPluginDependencies = {
  kind: 'stylesheet';
  importPath: string;
};

/**
 * Stylesheet dependencies for an integration plugin with content.
 */
type StylesheetContentIntegrationPluginDependencies = {
  kind: 'stylesheet';
  content: string;
};

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
 * The Integration Plugin interface.
 * It represents a plugin that integrates a third-party library or service with EcoPages.
 */
export type IntegrationPlugin = {
  name: string;
  extensions: string[];
  renderer: typeof IntegrationRenderer;
  dependencies?: IntegrationPluginDependencies[];
};
