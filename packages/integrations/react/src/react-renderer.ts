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
  componentDirectory = '__integrations__';

  private createHydrationScript(importPath: string) {
    return `import {hydrateRoot as hr, createElement as ce} from "react-dom/client";import c from "${importPath}";window.onload=()=>hr(document,ce(c))`;
  }

  private getBuildPlugins(): BunPlugin[] {
    const plugins: BunPlugin[] = [];

    for (const processor of this.appConfig.processors.values()) {
      if (processor.buildPlugin) {
        plugins.push(processor.buildPlugin.createBuildPlugin());
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
      const componentName = `component-${Math.random().toString(36).slice(2)}`;

      const absolutePath = path.join(this.appConfig.absolutePaths.distDir, this.componentDirectory);

      const hydrationScriptPath = path.join(absolutePath, `${componentName}-hydration.js`);

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

  private getReactUrls(): ReactUrls {
    const isDevMode = import.meta.env.NODE_ENV === 'development';
    return {
      current: isDevMode ? '/__integrations__/react-dev-esm.js' : '/__integrations__/react-esm.js',
      toRemove: isDevMode ? '/__integrations__/react-esm.js' : '/__integrations__/react-dev-esm.js',
    };
  }

  private createImportMapScript(reactUrl: string, isDevMode: boolean): React.JSX.Element {
    const imports = isDevMode
      ? {
          react: reactUrl,
          'react-dom/client': reactUrl,
          'react/jsx-dev-runtime': reactUrl,
          'react-dom': '/__integrations__/react-dom-esm.js',
        }
      : {
          react: reactUrl,
          'react-dom/client': reactUrl,
          'react/jsx-runtime': reactUrl,
          'react-dom': '/__integrations__/react-dom-esm.js',
        };

    return createElement(
      'script',
      {
        key: 'importmap',
        defer: true,
        type: 'importmap',
      },
      JSON.stringify({ imports }),
    );
  }

  private createStylesheetElements(stylesheets: string[]): React.JSX.Element[] {
    return stylesheets.map((stylesheet) => {
      return createElement('link', {
        key: stylesheet,
        rel: 'stylesheet',
        href: stylesheet,
        as: 'style',
      });
    });
  }

  private createScriptElements(
    scripts: string[],
    hydrationScriptPath: string,
    reactUrlToRemove: string,
  ): React.JSX.Element[] {
    const filteredScripts = [...scripts.filter((script) => !script.includes(reactUrlToRemove)), hydrationScriptPath];
    return filteredScripts.map((script) => {
      return createElement('script', {
        key: script,
        defer: true,
        type: 'module',
        src: script,
      });
    });
  }

  private async createDynamicHead({ dependencies, pagePath }: HeadConfig) {
    const hydrationScriptPath = await this.generateHydrationScript(pagePath);
    const isDevMode = import.meta.env.NODE_ENV === 'development';
    const { current: reactUrl, toRemove: reactUrlToRemove } = this.getReactUrls();

    const elements: React.JSX.Element[] = [this.createImportMapScript(reactUrl, isDevMode)];

    if (dependencies) {
      if (dependencies.stylesheets?.length) {
        elements.push(...this.createStylesheetElements(dependencies.stylesheets));
      }

      if (dependencies.scripts?.length) {
        elements.push(...this.createScriptElements(dependencies.scripts, hydrationScriptPath, reactUrlToRemove));
      }
    }

    return elements;
  }

  async render({
    params,
    query,
    props,
    metadata,
    dependencies,
    Page,
    file,
    HtmlTemplate,
  }: IntegrationRendererRenderOptions<JSX.Element>): Promise<RouteRendererBody> {
    try {
      const headContent = (await this.createDynamicHead({
        dependencies,
        pagePath: file,
      })) as any;

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
