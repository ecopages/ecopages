import {
  type EcoComponentDependencies,
  type EcoPagesConfig,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { PLUGIN_NAME } from './react.plugin';

export class ReactRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  collectDependencies({
    dependencies,
    appConfig,
  }: { dependencies?: EcoComponentDependencies; appConfig: EcoPagesConfig }) {
    return {
      stylesheets: [
        ...(dependencies?.stylesheets || []),
        ...appConfig.integrationsDependencies
          .filter((dep) => dep.kind === 'stylesheet')
          .flatMap((dep) => dep.filePath.split(`${appConfig.distDir}/`)[1]),
      ],
      scripts: [
        ...(dependencies?.scripts || []),
        ...appConfig.integrationsDependencies
          .filter((dep) => dep.kind === 'script')
          .flatMap((dep) => dep.filePath.split(`${appConfig.distDir}/`)[1]),
      ],
    };
  }

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
    appConfig,
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
          headContent: this.createDynamicHead({
            dependencies: this.collectDependencies({ dependencies: Page.dependencies, appConfig }),
          }),
          children: Page({ params, query, ...props }),
        }),
      );

      return body as any;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
