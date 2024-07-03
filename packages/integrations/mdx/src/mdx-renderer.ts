/**
 * This module contains the MDX renderer
 * @module
 */

import { deepMerge } from '@ecopages/core';
import { invariant } from '@ecopages/core';
import { PLUGIN_NAME } from './mdx.plugin.ts';

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

/**
 * A structure representing an MDX file
 */
export type MDXFile = {
  default: EcoPage;
  layout?: EcoComponent;
  config?: EcoComponentConfig;
  getMetadata: GetMetadata;
};

/**
 * Options for the MDX renderer
 */
interface MDXIntegrationRendererOpions extends IntegrationRendererRenderOptions {
  layout?: EcoComponent;
  mdxDependencies: EcoComponentDependencies;
}

/**
 * A renderer for the MDX integration.
 */
export class MDXRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  protected override async importPageFile(file: string): Promise<
    EcoPageFile<{
      layout?:
        | EcoComponent<any>
        | {
            config: EcoComponentConfig | undefined;
          };
      mdxDependencies: EcoComponentDependencies;
    }>
  > {
    try {
      const { default: Page, config, layout = { config }, getMetadata } = (await import(file)) as MDXFile;

      const layoutDependencies = layout ? this.collectDependencies({ config: layout.config }) : {};

      const pageDependencies = this.collectDependencies({ config });

      return {
        default: Page,
        layout,
        mdxDependencies: deepMerge(layoutDependencies, pageDependencies),
        getMetadata,
      };
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

      const children = typeof layout === 'function' ? layout({ children: Page({}) }) : Page({});

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
