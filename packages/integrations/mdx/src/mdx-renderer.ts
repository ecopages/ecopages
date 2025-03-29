/**
 * This module contains the MDX renderer
 * @module
 */

import { type EcoPagesElement, deepMerge } from '@ecopages/core';
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
interface MDXIntegrationRendererOpions<C = EcoPagesElement> extends IntegrationRendererRenderOptions<C> {
  layout?: EcoComponent;
}

/**
 * A renderer for the MDX integration.
 */
export class MDXRenderer extends IntegrationRenderer<EcoPagesElement> {
  name = PLUGIN_NAME;

  protected override async importPageFile(file: string): Promise<
    EcoPageFile<{
      layout?:
        | EcoComponent<any>
        | {
            config: EcoComponentConfig | undefined;
          };
    }>
  > {
    try {
      const { default: Page, config, layout = { config }, getMetadata } = await import(file);

      if (layout.config?.dependencies) {
        await this.collectDependencies({ config: layout.config });
      }

      if (config?.dependencies) {
        await this.collectDependencies({ config });
      }

      return {
        default: Page,
        layout,
        getMetadata,
      };
    } catch (error) {
      invariant(false, `Error importing MDX file: ${error}`);
    }
  }

  async render({ metadata, Page, HtmlTemplate, layout }: MDXIntegrationRendererOpions): Promise<RouteRendererBody> {
    try {
      const children = typeof layout === 'function' ? layout({ children: Page({}) }) : Page({});

      const body = await HtmlTemplate({
        metadata,
        children,
      });

      return this.DOC_TYPE + body;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
