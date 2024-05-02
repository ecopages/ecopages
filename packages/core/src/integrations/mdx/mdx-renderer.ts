import { invariant } from '@/global/utils';
import { IntegrationRenderer, type IntegrationRendererRenderOptions } from '@/route-renderer/integration-renderer';
import type { RouteRendererBody } from '@/route-renderer/route-renderer';
import type { EcoComponentDependencies, EcoPage, EcoPageFile } from '@types';
import { MDX_DESCRIPTOR } from './mdx.plugin';

export type MDXFile = {
  default: EcoPage;
  dependencies?: EcoComponentDependencies;
};

export class MDXRenderer extends IntegrationRenderer {
  descriptor = MDX_DESCRIPTOR;

  protected override async importPageFile(file: string): Promise<EcoPageFile> {
    try {
      const { default: Page, dependencies } = (await import(file)) as MDXFile;
      Page.dependencies = dependencies ?? {};
      return { default: Page };
    } catch (error) {
      invariant(false, `Error importing MDX file: ${error}`);
    }
  }

  async render({ metadata, Page, HtmlTemplate }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    console.log('DEPS', Page.dependencies);
    try {
      const body = await HtmlTemplate({
        metadata,
        headContent: await this.getHeadContent(Page.dependencies),
        children: await Page({}),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
