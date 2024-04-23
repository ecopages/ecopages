import type { EcoComponentDependencies, GetMetadata, GetStaticProps } from '@/eco-pages';
import { invariant } from '@/global/utils';
import { HeadContentBuilder } from '@/route-renderer/utils/head-content-builder';
import type { RouteRendererBody, RouteRendererOptions } from './route-renderer';
import { uncacheModules } from './utils/uncache-modules';

export abstract class AbstractRenderer {
  abstract render(options: RouteRendererOptions): Promise<RouteRendererBody>;
}

export class IntegrationRenderer extends AbstractRenderer {
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

  protected async getHeadContent(dependencies?: EcoComponentDependencies, scriptsToInject?: string[]) {
    const headContent = await new HeadContentBuilder().build({
      dependencies: dependencies,
      scriptsToInject,
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
    uncacheModules();
  }

  public async execute(options: RouteRendererOptions): Promise<RouteRendererBody> {
    this.prepareRender(options);
    return this.render(options);
  }

  render(_: RouteRendererOptions): Promise<RouteRendererBody> {
    invariant(false, `Method not implemented. Please override the render method in subclass: ${this.constructor.name}`);
  }
}
