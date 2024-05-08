import {
  type EcoComponent,
  type EcoComponentDependencies,
  type EcoPage,
  type EcoPageFile,
  type GetMetadata,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
  deepMerge,
  invariant,
} from '@eco-pages/core';

import { PLUGIN_NAME } from './mdx.plugin';

export type MDXFile = {
  default: EcoPage;
  layout?: EcoComponent;
  dependencies?: EcoComponentDependencies;
  getMetadata: GetMetadata;
};

export class MDXRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  protected override async importPageFile(file: string): Promise<EcoPageFile<{ layout?: EcoComponent }>> {
    try {
      const { default: Page, dependencies, layout, getMetadata } = (await import(file)) as MDXFile;

      if (dependencies) Page.dependencies = dependencies;

      return { default: Page, layout, getMetadata };
    } catch (error) {
      invariant(false, `Error importing MDX file: ${error}`);
    }
  }

  async render({ metadata, Page, HtmlTemplate, layout }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const body = await HtmlTemplate({
        metadata,
        headContent: await this.getHeadContent(deepMerge(Page.dependencies, layout?.dependencies)),
        children: layout ? layout({ children: Page({}) }) : Page({}),
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
