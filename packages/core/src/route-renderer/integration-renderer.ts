/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type {
  EcoComponent,
  EcoComponentDependencies,
  EcoPage,
  EcoPageFile,
  EcoPagesElement,
  GetMetadata,
  GetMetadataContext,
  GetStaticProps,
  HtmlTemplateProps,
  IntegrationRendererRenderOptions,
  PageMetadataProps,
  RouteRendererBody,
  RouteRendererOptions,
} from '../public-types.ts';
import { DependencyHelpers, type DependencyService } from '../services/dependency.service.ts';
import { invariant } from '../utils/invariant.ts';

/**
 * Abstract class representing an integration renderer.
 */
export abstract class IntegrationRenderer<C = EcoPagesElement> {
  abstract name: string;
  protected appConfig: EcoPagesAppConfig;
  protected dependencyService?: DependencyService;
  protected declare options: Required<IntegrationRendererRenderOptions>;

  protected DOC_TYPE = '<!DOCTYPE html>';

  constructor({
    appConfig,
    dependencyService,
  }: {
    appConfig: EcoPagesAppConfig;
    dependencyService?: DependencyService;
  }) {
    this.appConfig = appConfig;
    this.dependencyService = dependencyService;
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

  protected async collectDependencies(Page: EcoPage | { config?: EcoComponent['config'] }): Promise<void> {
    if (!Page.config || !this.dependencyService) return;
    if (!Page.config.importMeta) appLogger.warn('No importMeta found in page config');
    if (!Page.config.dependencies) return;

    const providerName = `${this.name}-${Page.config.importMeta.filename}`;
    const areDependenciesResolved = this.dependencyService?.hasProvider(providerName);

    if (areDependenciesResolved) return;

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

    const deps = {
      stylesheets: Array.from(stylesheetsSet),
      scripts: Array.from(scriptsSet),
    };

    this.dependencyService.addProvider({
      name: providerName,
      getDependencies: () => [
        ...deps.stylesheets.map((srcUrl) =>
          DependencyHelpers.createPreBundledStylesheetDependency({
            srcUrl,
            position: 'head',
            attributes: { rel: 'stylesheet' },
          }),
        ),
        ...deps.scripts.map((srcUrl) =>
          DependencyHelpers.createPreBundledScriptDependency({
            srcUrl,
            position: 'head',
            attributes: {
              type: 'module',
              defer: '',
            },
          }),
        ),
      ],
    });
  }

  protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
    if (typeof HTMLElement === 'undefined') {
      // @ts-expect-error - This issues appeared from one moment to another after a bun update, need to investigate
      global.HTMLElement = class {};
    }

    const {
      default: Page,
      getStaticProps,
      getMetadata,
      ...integrationSpecificProps
    } = await this.importPageFile(options.file);

    const HtmlTemplate = await this.getHtmlTemplate();

    const { props } = await this.getStaticProps(getStaticProps, options);

    const metadata = await this.getMetadataProps(getMetadata, {
      props,
      params: options.params ?? {},
      query: options.query ?? {},
    } as GetMetadataContext);

    await this.collectDependencies(Page);

    return {
      ...options,
      ...integrationSpecificProps,
      HtmlTemplate,
      props,
      Page,
      metadata,
      params: options.params || {},
      query: options.query || {},
    };
  }

  public async execute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    const renderOptions = await this.prepareRenderOptions(options);
    return this.render(renderOptions as IntegrationRendererRenderOptions<C>);
  }

  abstract render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
}
