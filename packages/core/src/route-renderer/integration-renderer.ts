import { HeadContentBuilder } from '@/route-renderer/utils/head-content-builder';
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
} from '@types';
import type { RouteRendererBody, RouteRendererOptions } from './route-renderer';

export type IntegrationRendererRenderOptions = RouteRendererOptions & {
  props?: Record<string, unknown>;
  metadata: PageMetadataProps;
  HtmlTemplate: EcoComponent<HtmlTemplateProps>;
  Page: EcoPage<PageProps>;
};

export abstract class IntegrationRenderer {
  protected appConfig: EcoPagesConfig;
  abstract descriptor: string;

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
      rendererDescriptor: this.descriptor,
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

  protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
    const { default: Page, getStaticProps, getMetadata } = (await import(options.file)) as EcoPageFile;

    const HtmlTemplate = await this.getHtmlTemplate();

    const { props } = await this.getStaticProps(getStaticProps, { params: options.params });

    const metadata = await this.getMetadataProps(getMetadata, {
      props,
      params: options.params,
      query: options.query,
    });

    return {
      ...options,
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
