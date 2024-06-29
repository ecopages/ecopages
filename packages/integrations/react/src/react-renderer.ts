import {
  type EcoComponentDependencies,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { PLUGIN_NAME } from './react.plugin';

export class ReactRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  createDynamicHead({ dependencies }: { dependencies?: EcoComponentDependencies }) {
    if (!dependencies) return React.createElement(React.Fragment, null);

    const elements: React.JSX.Element[] = [];

    if (dependencies.stylesheets?.length) {
      for (const stylesheet of dependencies.stylesheets) {
        elements.push(
          React.createElement('link', { key: stylesheet, rel: 'stylesheet', href: stylesheet, as: 'style' }),
        );
      }
    }
    if (dependencies.scripts?.length) {
      for (const script of dependencies.scripts) {
        elements.push(React.createElement('script', { key: script, defer: true, type: 'module', src: script }));
      }
    }

    return React.createElement(React.Fragment, null, elements);
  }

  async render({
    params,
    query,
    props,
    metadata,
    dependencies,
    Page,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const body = await renderToReadableStream(
        HtmlTemplate({
          metadata,
          headContent: this.createDynamicHead({ dependencies }),
          children: Page({ params, query, ...props }),
        }),
      );

      return body as any;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
