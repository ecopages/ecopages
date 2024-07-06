import {
  type EcoComponentDependencies,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import { renderToReadableStream } from 'react-dom/server';
import { Fragment } from 'react/jsx-runtime';
import { PLUGIN_NAME } from './react.plugin';

export class ReactRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;

  createDynamicHead({ dependencies }: { dependencies?: EcoComponentDependencies }) {
    const elements: React.JSX.Element[] = [];
    if (dependencies) {
      if (dependencies.stylesheets?.length) {
        for (const stylesheet of dependencies.stylesheets) {
          const linkElement = <link key={stylesheet} rel="stylesheet" href={stylesheet} as="style" />;
          elements.push(linkElement);
        }
      }

      if (dependencies.scripts?.length) {
        for (const script of dependencies.scripts) {
          const scriptElement = <script key={script} defer type="module" src={script} />;
          elements.push(scriptElement);
        }
      }
    }

    return <Fragment>{elements}</Fragment>;
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
        <HtmlTemplate metadata={metadata} headContent={this.createDynamicHead({ dependencies })}>
          <Page params={params} query={query} {...props} />
        </HtmlTemplate>,
      );

      return body;
    } catch (error) {
      throw new Error(`[ecopages] Error rendering page: ${error}`);
    }
  }
}
