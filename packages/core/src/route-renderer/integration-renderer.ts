import { HeadContentBuilder } from '@/route-renderer/utils/head-content-builder';
import { invariant } from '@/utils/invariant';
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
  PageMetadataProps,
  PageProps,
  RouteRendererOptions,
} from '@types';
import type { RouteRendererBody } from './route-renderer';

export type IntegrationRendererRenderOptions = RouteRendererOptions & {
  props?: Record<string, unknown>;
  metadata: PageMetadataProps;
  HtmlTemplate: EcoComponent<HtmlTemplateProps>;
  Page: EcoPage<PageProps>;
  appConfig: EcoPagesConfig;
};

export abstract class IntegrationRenderer {
  abstract name: string;
  protected appConfig: EcoPagesConfig;

  protected declare options: Required<IntegrationRendererRenderOptions>;

  protected DOC_TYPE = '<!DOCTYPE html>';

  constructor(appConfig: EcoPagesConfig) {
    this.appConfig = appConfig;
  }

  protected getHtmlPath({ file }: { file: string }) {
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
    const { absolutePaths: derivedPaths } = globalThis.ecoConfig;
    const { default: HtmlTemplate } = await import(derivedPaths.htmlTemplatePath);
    return HtmlTemplate;
  }

  protected async getHeadContent(dependencies?: EcoComponentDependencies) {
    const headContent = await new HeadContentBuilder().build({
      integrationName: this.name,
      dependencies: dependencies,
    });
    return headContent;
  }

  protected async getStaticProps(
    getStaticProps?: GetStaticProps<Record<string, unknown>>,
    options?: Pick<RouteRendererOptions, 'params'>,
  ) {
    return getStaticProps && options?.params
      ? await getStaticProps({
          pathname: { params: options.params },
        })
          .then((data) => data)
          .catch((err) => {
            throw new Error(`[eco-pages] Error fetching static props: ${err.message}`);
          })
      : {
          props: {},
          metadata: undefined,
        };
  }

  protected async getMetadataProps(getMetadata: GetMetadata | undefined, { props, params, query }: GetMetadataContext) {
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
    });

    return {
      ...options,
      ...integrationSpecificProps,
      appConfig: this.appConfig,
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
    return this.render(renderOptions);
  }

  abstract render(options: IntegrationRendererRenderOptions): Promise<RouteRendererBody>;
}
