/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import path from 'node:path';
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
 * The IntegrationRenderer class is an abstract class that provides a base for rendering integration-specific components in the EcoPages framework.
 * It handles the import of page files, collection of dependencies, and preparation of render options.
 * The class is designed to be extended by specific integration renderers.
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

  /**
   * Returns the HTML path from the provided file path.
   * It extracts the path relative to the pages directory and removes the 'index' part if present.
   *
   * @param file - The file path to extract the HTML path from.
   * @returns The extracted HTML path.
   */
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

  /**
   * Returns the HTML template component.
   * It imports the HTML template from the specified path in the app configuration.
   *
   * @returns The HTML template component.
   */
  protected async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
    const { absolutePaths } = this.appConfig;
    try {
      const { default: HtmlTemplate } = await import(absolutePaths.htmlTemplatePath);
      return HtmlTemplate;
    } catch (error) {
      invariant(false, `Error importing HtmlTemplate: ${error}`);
    }
  }

  /**
   * Returns the static props for the page.
   * It calls the provided getStaticProps function with the given options.
   *
   * @param getStaticProps - The function to get static props.
   * @param options - The options to pass to the getStaticProps function.
   * @returns The static props and metadata.
   */
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
          appConfig: this.appConfig,
        })
          .then((data) => data)
          .catch((err) => {
            throw new Error(`Error fetching static props: ${err.message}`);
          })
      : {
          props: {},
          metadata: undefined,
        };
  }

  /**
   * Returns the metadata properties for the page.
   * It calls the provided getMetadata function with the given context.
   *
   * @param getMetadata - The function to get metadata.
   * @param context - The context to pass to the getMetadata function.
   * @returns The metadata properties.
   */
  protected async getMetadataProps(
    getMetadata: GetMetadata | undefined,
    { props, params, query }: GetMetadataContext,
  ): Promise<PageMetadataProps> {
    let metadata: PageMetadataProps = this.appConfig.defaultMetadata;
    if (getMetadata) {
      const dynamicMetadata = await getMetadata({ params, query, props, appConfig: this.appConfig });
      metadata = { ...metadata, ...dynamicMetadata };
    }
    return metadata;
  }

  /**
   * Imports the page file from the specified path.
   * It uses dynamic import to load the file and returns the imported module.
   *
   * @param file - The file path to import.
   * @returns The imported module.
   */
  protected async importPageFile(file: string): Promise<EcoPageFile> {
    try {
      return await import(file);
    } catch (error) {
      invariant(false, `Error importing page file: ${error}`);
    }
  }

  /**
   * Resolves the dependency path based on the import meta information.
   * It combines the directory of the import meta with the provided path URL.
   *
   * @param importMeta - The import meta information.
   * @param pathUrl - The path URL to resolve.
   * @returns The resolved dependency path.
   */
  protected resolveDependencyPath(importMeta: ImportMeta, pathUrl: string): string {
    return path.join(importMeta.dir, pathUrl);
  }

  /**
   * Extracts the dependencies from the provided component configuration.
   * It resolves the paths for scripts and stylesheets based on the import meta information.
   *
   * @param importMeta - The import meta information.
   * @param scripts - The scripts to extract.
   * @param stylesheets - The stylesheets to extract.
   * @returns The extracted dependencies.
   */
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

  /**
   * Collects the dependencies for the provided components.
   * It registers the dependencies with the assets dependency service.
   *
   * @param components - The components to collect dependencies from.
   */
  protected async collectDependencies(components: (EcoComponent | Partial<EcoComponent>)[]): Promise<void> {
    if (!this.assetsDependencyService) return;

    for (const component of components) {
      if (!component.config?.importMeta) continue;
      const providerName = `${this.name}-${component.config.importMeta?.filename}`;
      const areDependenciesResolved = this.assetsDependencyService?.hasDependencies(providerName);

      if (areDependenciesResolved) continue;

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

  /**
   * Cleans up and prepares the dependencies for the provided file.
   * It sets the current path in the assets dependency service and invalidates the cache if needed.
   *
   * @param file - The file path to clean up and prepare dependencies for.
   */
  protected async cleanupAndPrepareDependencies(file: string): Promise<void> {
    if (!this.assetsDependencyService) return;

    const currentPath = this.getHtmlPath({ file });
    this.assetsDependencyService.setCurrentPath(currentPath);

    if (!this.assetsDependencyService.hasDependencies(currentPath)) {
      this.assetsDependencyService.invalidateCache(currentPath);
    }

    this.assetsDependencyService.cleanupPageDependencies();
  }

  /**
   * Prepares the render options for the integration renderer.
   * It imports the page file, collects dependencies, and prepares the render options.
   *
   * @param options - The route renderer options.
   * @returns The prepared render options.
   */
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

  /**
   * Executes the integration renderer with the provided options.
   * It cleans up and prepares dependencies, prepares render options, and calls the render method.
   *
   * @param options - The route renderer options.
   * @returns The rendered body.
   */
  public async execute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    await this.cleanupAndPrepareDependencies(options.file);

    const renderOptions = await this.prepareRenderOptions(options);
    return this.render(renderOptions as IntegrationRendererRenderOptions<C>);
  }

  /**
   * Abstract method to render the integration-specific component.
   * This method should be implemented by the specific integration renderer.
   *
   * @param options - The integration renderer render options.
   * @returns The rendered body.
   */
  abstract render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;
}
