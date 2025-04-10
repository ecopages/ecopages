/**
 * This module contains the React renderer
 * @module
 */

import path from 'node:path';
import {
  type EcoComponentDependencies,
  FileUtils,
  type HtmlTemplateProps,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import { AssetsDependencyService } from '@ecopages/core/services/assets-dependency-service';
import type { BunPlugin } from 'bun';
import { type JSX, createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { PLUGIN_NAME } from './react.plugin';

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
 * Configuration for the head of the page.
 */
interface HeadConfig {
  dependencies?: EcoComponentDependencies;
  pagePath: string;
}

/**
 * URLs for React scripts.
 */
interface ReactUrls {
  current: string;
  toRemove: string;
}

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<JSX.Element> {
  name = PLUGIN_NAME;
  componentDirectory = AssetsDependencyService.RESOLVED_ASSETS_DIR;

  private createHydrationScript(importPath: string) {
    return `import {hydrateRoot as hr, createElement as ce} from "react-dom/client";import c from "${importPath}";window.onload=()=>hr(document,ce(c))`;
  }

  private getBuildPlugins(): BunPlugin[] {
    const plugins: BunPlugin[] = [];

    for (const processor of this.appConfig.processors.values()) {
      if (processor.buildPlugins) {
        plugins.push(...processor.buildPlugins);
      }
    }

    return plugins;
  }

  private async bundleComponent({
    pagePath,
    componentName,
    absolutePath,
  }: {
    pagePath: string;
    componentName: string;
    absolutePath: string;
  }) {
    try {
      const build = await Bun.build({
        entrypoints: [pagePath],
        format: 'esm',
        minify: true,
        outdir: absolutePath,
        naming: `${componentName}.[ext]`,
        external: ['react', 'react-dom'],
        plugins: this.getBuildPlugins(),
      });

      if (!build.success) {
        throw new BundleError(
          'Failed to bundle component',
          build.logs.map((log) => log.toString()),
        );
      }

      if (!build.outputs.length) {
        throw new BundleError('Bundle succeeded but no outputs were generated', []);
      }

      const outputPath = build.outputs[0].path;
      FileUtils.gzipFileSync(outputPath);
      return outputPath.split(this.appConfig.absolutePaths.distDir)[1];
    } catch (error) {
      if (error instanceof BundleError) {
        throw error;
      }
      throw new ReactRenderError(
        `Unexpected error while bundling component: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async generateHydrationScript(pagePath: string) {
    try {
      const pathHash = rapidhash(pagePath);
      const componentName = `component-${pathHash}`;

      const absolutePath = path.join(this.appConfig.absolutePaths.distDir, this.componentDirectory);
      const hydrationScriptPath = path.join(absolutePath, `${componentName}-hydration.js`);

      if (FileUtils.existsSync(hydrationScriptPath)) {
        return hydrationScriptPath.split(this.appConfig.absolutePaths.distDir)[1];
      }

      const relativeImportInScript = await this.bundleComponent({
        pagePath,
        componentName,
        absolutePath,
      });

      const hydrationCode = this.createHydrationScript(relativeImportInScript);

      FileUtils.writeFileSync(hydrationScriptPath, hydrationCode);

      FileUtils.gzipFileSync(hydrationScriptPath);

      return hydrationScriptPath.split(this.appConfig.absolutePaths.distDir)[1];
    } catch (error) {
      if (error instanceof BundleError) {
        console.error('[ecopages] Bundle errors:', error.logs);
      }
      throw new ReactRenderError(
        `Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createScriptElements(scripts: string[]): React.JSX.Element[] {
    return scripts.map((script) => {
      return createElement('script', {
        key: script,
        defer: true,
        type: 'module',
        src: script,
      });
    });
  }

  async render({
    params,
    query,
    props,
    metadata,
    Page,
    file,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions<JSX.Element>): Promise<RouteRendererBody> {
    try {
      const hydrationScriptPath = await this.generateHydrationScript(file);
      const headContent = this.createScriptElements([hydrationScriptPath]) as any;

      const body = await renderToReadableStream(
        createElement(
          HtmlTemplate,
          {
            metadata,
            headContent,
          } as HtmlTemplateProps,
          createElement(Page, { params, query, ...props }),
        ),
      );

      return body;
    } catch (error) {
      throw new ReactRenderError(
        `Failed to render component: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
