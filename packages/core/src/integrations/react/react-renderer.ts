import type { RouteRendererBody } from '@/route-renderer/route-renderer';
import {
  type EcoComponentDependencies,
  type EcoPagesConfig,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
} from '@eco-pages/core';
import { renderToReadableStream } from 'react-dom/server';
import { DynamicHead, reactPlugin } from './react.plugin';

export class ReactRenderer extends IntegrationRenderer {
  name = reactPlugin.name;

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
          headContent: DynamicHead({
            dependencies: this.collectDependencies({ dependencies: Page.dependencies, appConfig }),
          }),
          children: Page({ params, query, ...props }),
        }),
      );

      return body;
    } catch (error) {
      throw new Error(`[eco-pages] Error rendering page: ${error}`);
    }
  }
}
