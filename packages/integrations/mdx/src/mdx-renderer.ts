/**
 * This module contains the MDX renderer
 * @module
 */

import { type EcoPagesElement, invariant } from '@ecopages/core';
import {
  type EcoComponent,
  type EcoComponentConfig,
  type EcoPageFile,
  type GetMetadata,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { PLUGIN_NAME } from './mdx.plugin.ts';

/**
 * A structure representing an MDX file
 */
export type MDXFile = {
  default: EcoComponent;
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

  override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
    const { config, layout } = await import(pagePath);
    const components: Partial<EcoComponent>[] = [];

    if (layout.config?.dependencies) {
      components.push({ config: layout.config });
    }

    if (config?.dependencies) {
      components.push({ config });
    }

    return await this.resolveDependencies(components);
  }

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
      const { default: Page, layout, getMetadata } = await import(file);

      if (typeof Page !== 'function') {
        throw new Error('MDX file must export a default function');
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
