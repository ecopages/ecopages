import { HeadContentBuilder } from '@/route-renderer/utils/head-content-builder';
import type { EcoComponentDependencies, GetMetadata, GetStaticProps } from '@types';
import type { RouteRendererBody, RouteRendererOptions } from './route-renderer';

export abstract class IntegrationRenderer {
  abstract descriptor: string;

  protected declare options: Required<RouteRendererOptions>;

  protected DOC_TYPE = '<!DOCTYPE html>';

  protected get pagesDir() {
    return globalThis.ecoConfig.absolutePaths.pagesDir;
  }

  protected getHtmlPath({ file }: { file: string }) {
    const pagesIndex = file.indexOf(this.pagesDir);
    if (pagesIndex === -1) return file;
    const startIndex = file.indexOf(this.pagesDir) + this.pagesDir.length;
    const endIndex = file.lastIndexOf('/');
    const path = file.substring(startIndex, endIndex);
    if (path === '/index') return '';
    return path;
  }

  protected async getHtmlTemplate() {
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

  protected async getProps(getStaticProps?: GetStaticProps<unknown>) {
    return getStaticProps
      ? await getStaticProps({
          pathname: { params: this.options.params },
        })
          .then((data) => data.props as Record<string, unknown>)
          .catch((err) => {
            throw new Error(`[eco-pages] Error fetching static props: ${err.message}`);
          })
      : {};
  }

  protected async getMetadataProps(getMetadata: GetMetadata | undefined, props: Record<string, unknown> = {}) {
    const { params, query } = this.options;
    return getMetadata ? await getMetadata({ params, query, ...props }) : undefined;
  }

  protected prepareRender(options: RouteRendererOptions) {
    this.options = {
      ...options,
      params: options.params || {},
      query: options.query || {},
    };
  }

  public async execute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    this.prepareRender(options);
    return this.render(options);
  }

  abstract render(_: RouteRendererOptions): Promise<RouteRendererBody>;
}
