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
  GetMetadata,
  GetMetadataContext,
  GetStaticProps,
  HtmlTemplateProps,
  IntegrationRendererRenderOptions,
  PageMetadataProps,
  RouteRendererBody,
  RouteRendererOptions,
} from '../index';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { IntegrationManager } from '../main/integration-manager.ts';
import { HeadContentBuilder } from '../route-renderer/utils/head-content-builder.ts';
import { invariant } from '../utils/invariant.ts';

/**
 * Abstract class representing an integration renderer.
 */
export abstract class IntegrationRenderer {
  abstract name: string;
  protected appConfig: EcoPagesAppConfig;
  protected integrationManager: IntegrationManager;
  protected declare options: Required<IntegrationRendererRenderOptions>;

  protected DOC_TYPE = '<!DOCTYPE html>';

  constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
    this.appConfig = appConfig;
    this.integrationManager = new IntegrationManager({
      appConfig,
    });
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
    const integrationsDependencies = await this.integrationManager.prepareDependencies();

    const headContent = await new HeadContentBuilder({
      appConfig: this.appConfig,
      integrationsDependencies,
    }).build({
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
    const EXTENSIONS_TO_JS = ['ts', 'tsx', 'jsx'];
    const safeFileName = pathUrl.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
    const distUrl = importMeta.url.split(this.appConfig.srcDir)[1].split(importMeta.file)[0];
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

  protected async collectDependencies(
    Page:
      | EcoPage
      | {
          config?: EcoComponent['config'];
        },
  ): Promise<EcoComponentDependencies> {
    if (!Page.config) {
      return {};
    }

    const stylesheetsSet = new Set<string>();
    const scriptsSet = new Set<string>();

    await this.integrationManager.prepareDependencies().then((deps) => {
      for (const dependency of deps) {
        if (dependency.integration === this.name) {
          if (dependency.kind === 'stylesheet') {
            stylesheetsSet.add(dependency.srcUrl);
          }

          if (dependency.kind === 'script') {
            scriptsSet.add(dependency.srcUrl);
          }
        }
      }
    });

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
    if (typeof HTMLElement === 'undefined') {
      // @ts-expect-error - This issues appeared from one moment to another, need to investigate
      global.HTMLElement = class {};
    }

    const {
      default: Page,
      getStaticProps,
      getMetadata,
      ...integrationSpecificProps
    } = await this.importPageFile(options.file);

    const dependencies = await this.collectDependencies(Page);

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
