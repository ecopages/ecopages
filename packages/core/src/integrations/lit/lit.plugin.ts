import { deepMerge } from '@/utils/deep-merge';
import type { IntegrationPlugin } from '@types';
import { LitRenderer } from './lit-renderer';

export type LitPluginOptions = {
  extensions: string[];
  dependencies: IntegrationPlugin['dependencies'];
};

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
  return { name: 'lit', extensions, renderer: LitRenderer, dependencies };
}
