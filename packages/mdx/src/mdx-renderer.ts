/** @jsxImportSource @kitajs/html */
import {
  type EcoComponentDependencies,
  type EcoPage,
  type EcoPageFile,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
  invariant,
} from '@eco-pages/core';

import { PLUGIN_NAME } from './mdx.plugin';

export type MDXFile = {
  default: EcoPage;
  dependencies?: EcoComponentDependencies;
};

export class MDXRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  protected override async importPageFile(file: string): Promise<EcoPageFile> {
    try {
      const { default: Page, dependencies } = (await import(file)) as MDXFile;

      if (dependencies) Page.dependencies = dependencies;

      return { default: Page };
    } catch (error) {
      invariant(false, `Error importing MDX file: ${error}`);
    }
  }

  async render({ metadata, Page, HtmlTemplate }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const body = await HtmlTemplate({
        metadata,
        headContent: await this.getHeadContent(Page.dependencies),
        children: Page({}),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
