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
import { AssetDependencyHelpers, type AssetsDependencyService } from '../services/assets-dependency.service.ts';
import { invariant } from '../utils/invariant.ts';

/**
 * Abstract class representing an integration renderer.
 */
export abstract class IntegrationRenderer<C = EcoPagesElement> {
  abstract name: string;
  protected appConfig: EcoPagesAppConfig;
  protected assetsDependencyService?: AssetsDependencyService;
  protected declare options: Required<IntegrationRendererRenderOptions>;

  protected DOC_TYPE = '<!DOCTYPE html>';

  constructor({
    appConfig,
    assetsDependencyService,
  }: {
    appConfig: EcoPagesAppConfig;
    assetsDependencyService?: AssetsDependencyService;
  }) {
    this.appConfig = appConfig;
    this.assetsDependencyService = assetsDependencyService;

    if (typeof HTMLElement === 'undefined') {
      // @ts-expect-error - This issues appeared from one moment to another after a bun update, need to investigate
      global.HTMLElement = class {};
    }
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

  protected resolveDependencyPath(importMeta: ImportMeta, pathUrl: string): string {
    return path.join(importMeta.dir, pathUrl);
  }

  protected extractDependencies({
    importMeta,
    scripts,
    stylesheets,
  }: {
    importMeta: ImportMeta;
  } & EcoComponentDependencies): EcoComponentDependencies {
    const scriptsPaths = [...new Set(scripts?.map((script) => this.resolveDependencyPath(importMeta, script)))];

    const stylesheetsPaths = [...new Set(stylesheets?.map((style) => this.resolveDependencyPath(importMeta, style)))];

    return {
      scripts: scriptsPaths,
      stylesheets: stylesheetsPaths,
    };
  }

  protected async collectDependencies(components: (EcoComponent | Partial<EcoComponent>)[]): Promise<void> {
    for (const component of components) {
      if (!component.config || !this.assetsDependencyService) return;
      if (!component.config.importMeta) appLogger.warn('No importMeta found in page config');
      if (!component.config.dependencies) return;

      const providerName = `${this.name}-${component.config.importMeta?.filename}`;
      const areDependenciesResolved = this.assetsDependencyService?.hasDependencies(providerName);

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

      collect(component.config);

      const deps = {
        stylesheets: Array.from(stylesheetsSet),
        scripts: Array.from(scriptsSet),
      };

      this.assetsDependencyService.registerDependencies({
        name: providerName,
        getDependencies: () => [
          ...deps.stylesheets.map((srcUrl) =>
            AssetDependencyHelpers.createStylesheetAsset({
              srcUrl,
              position: 'head',
              attributes: { rel: 'stylesheet' },
            }),
          ),
          ...deps.scripts.map((srcUrl) =>
            AssetDependencyHelpers.createSrcScriptAsset({
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
  }

  protected async cleanupAndPrepareDependencies(file: string): Promise<void> {
    if (!this.assetsDependencyService) return;

    const currentPath = this.getHtmlPath({ file });
    this.assetsDependencyService.setCurrentPath(currentPath);

    if (!this.assetsDependencyService.hasDependencies(currentPath)) {
      this.assetsDependencyService.invalidateCache(currentPath);
    }

    this.assetsDependencyService.cleanupPageDependencies();
  }

  protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
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

    await this.collectDependencies([HtmlTemplate, Page]);

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
    await this.cleanupAndPrepareDependencies(options.file);

    const renderOptions = await this.prepareRenderOptions(options);
    return this.render(renderOptions as IntegrationRendererRenderOptions<C>);
  }

  abstract render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
}
