import type { RouteRendererBody } from '@/route-renderer/route-renderer';
import { IntegrationRenderer, type IntegrationRendererRenderOptions } from '@eco-pages/core';
import { renderToReadableStream } from 'react-dom/server';
import { DynamicHead, reactPlugin } from './react.plugin';

export class ReactRenderer extends IntegrationRenderer {
  name = reactPlugin.name;

  async render({
    params,
    query,
    props,
    metadata,
    Page,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const body = await renderToReadableStream(
        HtmlTemplate({
          metadata,
          dependencies: Page.dependencies,
          headContent: DynamicHead({ dependencies: Page.dependencies }),
          children: Page({ params, query, ...props }),
        }),
      );

      return body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
