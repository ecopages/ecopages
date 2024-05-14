import { type IntegrationPlugin, deepMerge } from '@eco-pages/core';
import { LitRenderer } from './lit-renderer';

export type LitPluginOptions = {
  extensions: string[];
  dependencies: IntegrationPlugin['dependencies'];
};

export const PLUGIN_NAME = 'lit';

export function litPlugin(options?: LitPluginOptions): IntegrationPlugin {
  const defaultOptions: LitPluginOptions = {
    extensions: ['.lit.tsx'],
    dependencies: [
      {
        kind: 'script',
        position: 'head',
        importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js',
      },
    ],
  };

  const finalOptions = options ? deepMerge(defaultOptions, options) : defaultOptions;

  const { extensions, dependencies } = finalOptions;
  return { name: PLUGIN_NAME, extensions, renderer: LitRenderer, dependencies };
}
