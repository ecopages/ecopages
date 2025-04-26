/**
 * This module contains the React renderer
 * @module
 */

import {
  type HtmlTemplateProps,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import {
  AssetDependencyHelpers,
  AssetsDependencyService,
  type ProcessedAsset,
} from '@ecopages/core/services/assets-dependency-service';
import { type JSX, createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { PLUGIN_NAME } from './react.plugin';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import path from 'node:path';

/**
 * Error thrown when an error occurs while rendering a React component.
 */
export class ReactRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReactRenderError';
  }
}

/**
 * Error thrown when an error occurs while bundling a React component.
 */
export class BundleError extends Error {
  constructor(
    message: string,
    public readonly logs: string[],
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<JSX.Element> {
  name = PLUGIN_NAME;
  componentDirectory = AssetsDependencyService.RESOLVED_ASSETS_DIR;

  private createHydrationScript(importPath: string): string {
    return `import {hydrateRoot as hr, createElement as ce} from "react-dom/client";import c from "${importPath}";window.onload=()=>hr(document,ce(c))`;
  }

  override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
    try {
      const pathHash = rapidhash(pagePath);
      const componentName = `ecopages-react-${pathHash}`;

      const resolvedAssetImportFilename = `/${path
        .join(RESOLVED_ASSETS_DIR, path.relative(this.appConfig.srcDir, pagePath))
        .replace(path.basename(pagePath), `${componentName}.js`)
        .replace(/\\/g, '/')}`;

      const dependencies = [
        AssetDependencyHelpers.createFileScript({
          position: 'head',
          filepath: pagePath,
          name: componentName,
          excludeFromHtml: true,
          bundle: true,
          bundleOptions: {
            external: ['react', 'react-dom'],
            naming: `${componentName}.[ext]`,
          },
          attributes: {
            type: 'module',
            defer: '',
          },
        }),
        AssetDependencyHelpers.createContentScript({
          position: 'head',
          content: this.createHydrationScript(resolvedAssetImportFilename),
          name: `${componentName}-hydration`,
          bundle: false,
          attributes: {
            type: 'module',
            defer: '',
          },
        }),
      ];

      if (!this.assetsDependencyService) throw new Error('AssetsDependencyService is not set');

      return await this.assetsDependencyService?.processDependencies(dependencies, componentName);
    } catch (error) {
      if (error instanceof BundleError) console.error('[ecopages] Bundle errors:', error.logs);

      throw new ReactRenderError(
        `Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async render({
    params,
    query,
    props,
    metadata,
    Page,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions<JSX.Element>): Promise<RouteRendererBody> {
    try {
      return await renderToReadableStream(
        createElement(
          HtmlTemplate,
          {
            metadata,
          } as HtmlTemplateProps,
          createElement(Page, { params, query, ...props }),
        ),
      );
    } catch (error) {
      throw new ReactRenderError(
        `Failed to render component: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
