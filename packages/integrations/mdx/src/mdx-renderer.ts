import { deepMerge } from '@ecopages/core';
import { invariant } from '@ecopages/core';
import { PLUGIN_NAME } from './mdx.plugin';

import {
  type EcoComponent,
  type EcoComponentConfig,
  type EcoComponentDependencies,
  type EcoPage,
  type EcoPageFile,
  type GetMetadata,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';

export type MDXFile = {
  default: EcoPage;
  layout?: EcoComponent;
  config?: EcoComponentConfig;
  getMetadata: GetMetadata;
};

interface MDXIntegrationRendererOpions extends IntegrationRendererRenderOptions {
  layout?: EcoComponent;
  mdxDependencies: EcoComponentDependencies;
}

export class MDXRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  protected override async importPageFile(
    file: string,
  ): Promise<EcoPageFile<{ layout?: EcoComponent; mdxDependencies: EcoComponentDependencies }> | undefined> {
    try {
      const { default: Page, config, layout, getMetadata } = (await import(file)) as MDXFile;

      const layoutDependencies = layout ? this.collectDependencies({ config: layout.config }) : {};

      const pageDependencies = this.collectDependencies({ config });

      return { default: Page, layout, mdxDependencies: deepMerge(layoutDependencies, pageDependencies), getMetadata };
    } catch (error) {
      invariant(false, `Error importing MDX file: ${error}`);
    }
  }

  async render({
    metadata,
    Page,
    HtmlTemplate,
    mdxDependencies,
    layout,
  }: MDXIntegrationRendererOpions): Promise<RouteRendererBody> {
    try {
      const headContent = await this.getHeadContent(mdxDependencies);

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
