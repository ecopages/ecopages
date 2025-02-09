import path from 'node:path';
import {
  type EcoComponentDependencies,
  FileUtils,
  IntegrationRenderer,
  type IntegrationRendererRenderOptions,
  type RouteRendererBody,
} from '@ecopages/core';
import { renderToReadableStream } from 'react-dom/server';
import { PLUGIN_NAME } from './react.plugin';

export class ReactRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReactRenderError';
  }
}

export class BundleError extends Error {
  constructor(
    message: string,
    public readonly logs: string[],
  ) {
    super(message);
    this.name = 'BundleError';
  }
}

export class ReactRenderer extends IntegrationRenderer {
  name = PLUGIN_NAME;
  componentDirectory = '__integrations__';

  private createHydrationScript(importPath: string) {
    return `import {hydrateRoot as hr} from "react-dom/client";import c from "${importPath}";window.onload=()=>hr(document,c({}))`;
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

  async generateHydrationScript(pagePath: string) {
    try {
      const componentName = `component-${Math.random().toString(36).slice(2)}`;

      const absolutePath = path.join(this.appConfig.absolutePaths.distDir, this.componentDirectory);

      const hydrationScriptPath = path.join(absolutePath, `${componentName}-hydration.js`);

      const relativeImportInScript = await this.bundleComponent({ pagePath, componentName, absolutePath });

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

  async createDynamicHead({ dependencies, pagePath }: { dependencies?: EcoComponentDependencies; pagePath: string }) {
    const hydrationScriptPath = await this.generateHydrationScript(pagePath);

    const isDevMode = import.meta.env.NODE_ENV === 'development';
    const reactUrl = isDevMode ? '/__integrations__/react-dev-esm.js' : '/__integrations__/react-esm.js';

    const elements: React.JSX.Element[] = [
      <script key="importmap" defer type="importmap">
        {JSON.stringify({
          imports: isDevMode
            ? {
                react: reactUrl,
                'react-dom/client': reactUrl,
                'react/jsx-dev-runtime': reactUrl,
              }
            : {
                react: reactUrl,
                'react-dom/client': reactUrl,
                'react/jsx-runtime': reactUrl,
              },
        })}
      </script>,
    ];

    if (dependencies) {
      if (dependencies.stylesheets?.length) {
        for (const stylesheet of dependencies.stylesheets) {
          const linkElement = <link key={stylesheet} rel="stylesheet" href={stylesheet} as="style" />;
          elements.push(linkElement);
        }
      }

      if (dependencies.scripts?.length) {
        for (const script of [
          ...dependencies.scripts.filter((script) => script.includes(reactUrl)),
          hydrationScriptPath,
        ]) {
          const scriptElement = <script key={script} defer type="module" src={script} />;
          elements.push(scriptElement);
        }
      }
    }

    return <>{elements}</>;
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
  }: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
    try {
      const headContent = await this.createDynamicHead({
        dependencies,
        pagePath: file,
      });
      const body = await renderToReadableStream(
        <HtmlTemplate metadata={metadata} headContent={headContent}>
          <Page params={params} query={query} {...props} />
        </HtmlTemplate>,
      );

      return body;
    } catch (error) {
      throw new ReactRenderError(
        `Failed to render component: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
