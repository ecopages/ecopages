/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import path from 'node:path';
import type {
  EcoComponent,
  EcoComponentDependencies,
  EcoPage,
  EcoPageFile,
  EcoPagesConfig,
  GetMetadata,
  GetMetadataContext,
  GetStaticProps,
  HtmlTemplateProps,
  IntegrationRendererRenderOptions,
  PageMetadataProps,
  RouteRendererBody,
  RouteRendererOptions,
} from '../index';
import { HeadContentBuilder } from '../route-renderer/utils/head-content-builder';
import { invariant } from '../utils/invariant';

/**
 * Abstract class representing an integration renderer.
 */
export abstract class IntegrationRenderer {
  abstract name: string;
  protected appConfig: EcoPagesConfig;

  protected declare options: Required<IntegrationRendererRenderOptions>;

  protected DOC_TYPE = '<!DOCTYPE html>';

  constructor(appConfig: EcoPagesConfig) {
    this.appConfig = appConfig;
  }

  protected getHtmlPath({ file }: { file: string }): string {
    const pagesDir = this.appConfig.absolutePaths.pagesDir;
    const pagesIndex = file.indexOf(pagesDir);
    if (pagesIndex === -1) return file;
    const startIndex = file.indexOf(pagesDir) + pagesDir.length;
    const endIndex = file.lastIndexOf('/');
    const path = file.substring(startIndex, endIndex);
    if (path === '/index') return '';
    return path;
  }

  protected async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
    const { absolutePaths } = this.appConfig;
    try {
      const { default: HtmlTemplate } = await import(absolutePaths.htmlTemplatePath);
      return HtmlTemplate;
    } catch (error) {
      invariant(false, `Error importing HtmlTemplate: ${error}`);
    }
  }

  protected async getHeadContent(dependencies?: EcoComponentDependencies): Promise<string | undefined> {
    const headContent = await new HeadContentBuilder(this.appConfig).build({
      integrationName: this.name,
      dependencies: dependencies,
    });
    return headContent;
  }

  protected async getStaticProps(
    getStaticProps?: GetStaticProps<Record<string, unknown>>,
    options?: Pick<RouteRendererOptions, 'params'>,
  ): Promise<{
    props: Record<string, unknown>;
    metadata?: PageMetadataProps;
  }> {
    return getStaticProps && options?.params
      ? await getStaticProps({
          pathname: { params: options.params },
        })
          .then((data) => data)
          .catch((err) => {
            throw new Error(`[ecopages] Error fetching static props: ${err.message}`);
          })
      : {
          props: {},
          metadata: undefined,
        };
  }

  protected async getMetadataProps(
    getMetadata: GetMetadata | undefined,
    { props, params, query }: GetMetadataContext,
  ): Promise<PageMetadataProps> {
    let metadata: PageMetadataProps = this.appConfig.defaultMetadata;
    if (getMetadata) {
      const dynamicMetadata = await getMetadata({ params, query, props });
      metadata = { ...metadata, ...dynamicMetadata };
    }
    return metadata;
  }

  protected async importPageFile(file: string): Promise<EcoPageFile> {
    try {
      return await import(file);
    } catch (error) {
      invariant(false, `Error importing page file: ${error}`);
    }
  }

  protected getDependencyDistPath(importMeta: ImportMeta, pathUrl: string): string {
    const { ecoConfig: config } = globalThis;
    const EXTENSIONS_TO_JS = ['ts', 'tsx', 'jsx'];
    const safeFileName = pathUrl.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
    const distUrl = importMeta.url.split(config.srcDir)[1].split(importMeta.file)[0];
    return path.join(distUrl, safeFileName);
  }

  protected extractDependencies({
    importMeta,
    scripts,
    stylesheets,
  }: {
    importMeta: ImportMeta;
  } & EcoComponentDependencies): EcoComponentDependencies {
    const scriptsPaths = [...new Set(scripts?.map((script) => this.getDependencyDistPath(importMeta, script)))];

    const stylesheetsPaths = [...new Set(stylesheets?.map((style) => this.getDependencyDistPath(importMeta, style)))];

    return {
      scripts: scriptsPaths,
      stylesheets: stylesheetsPaths,
    };
  }

  protected collectDependencies(Page: EcoPage): EcoComponentDependencies {
    if (!Page.config) {
      return {};
    }

    const stylesheetsSet = new Set<string>();
    const scriptsSet = new Set<string>();

    const collect = (config: EcoComponent['config']) => {
      if (!config?.dependencies) return;

      const collectedDependencies = this.extractDependencies({
        ...config.dependencies,
        importMeta: config.importMeta,
      });

      for (const stylesheet of collectedDependencies.stylesheets || []) {
        stylesheetsSet.add(stylesheet);
      }

      for (const script of collectedDependencies.scripts || []) {
        scriptsSet.add(script);
      }

      if (config.dependencies.components) {
        for (const component of config.dependencies.components) {
          if (component.config) {
            collect(component.config);
          }
        }
      }
    };

    collect(Page.config);

    return {
      stylesheets: Array.from(stylesheetsSet),
      scripts: Array.from(scriptsSet),
    };
  }

  protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
    const {
      default: Page,
      getStaticProps,
      getMetadata,
      ...integrationSpecificProps
    } = await this.importPageFile(options.file);

    const dependencies = this.collectDependencies(Page);

    const HtmlTemplate = await this.getHtmlTemplate();

    const { props } = await this.getStaticProps(getStaticProps, options);

    const metadata = await this.getMetadataProps(getMetadata, {
      props,
      params: options.params ?? {},
      query: options.query ?? {},
    } as GetMetadataContext);

    return {
      ...options,
      ...integrationSpecificProps,
      appConfig: this.appConfig,
      HtmlTemplate,
      props,
      Page,
      dependencies,
      metadata,
      params: options.params || {},
      query: options.query || {},
    };
  }

  public async execute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    const renderOptions = await this.prepareRenderOptions(options);
    return this.render(renderOptions);
  }

  abstract render(options: IntegrationRendererRenderOptions): Promise<RouteRendererBody>;
}
