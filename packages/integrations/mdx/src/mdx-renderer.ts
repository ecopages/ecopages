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
} from '@ecopages/core';

import { PLUGIN_NAME } from './mdx.plugin';

export type MDXFile = {
  default: EcoPage;
  layout?: EcoComponent;
  dependencies?: EcoComponentDependencies;
  getMetadata: GetMetadata;
};

interface MDXIntegrationRendererOpions extends IntegrationRendererRenderOptions {
  layout?: EcoComponent;
}

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

  async render({ metadata, Page, HtmlTemplate, layout }: MDXIntegrationRendererOpions): Promise<RouteRendererBody> {
    try {
      const headContent = await this.getHeadContent(deepMerge(Page.dependencies ?? {}, layout?.dependencies ?? {}));

      const children = layout ? layout({ children: Page({}) }) : Page({});

      const body = await HtmlTemplate({
        metadata,
        headContent,
        children,
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
