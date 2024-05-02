import type { IntegrationPlugin } from '@types';
import { LitRenderer } from './lit-renderer';

export const litPlugin: IntegrationPlugin = {
  name: 'lit',
  extensions: ['.lit.tsx'],
  renderer: LitRenderer,
  dependencies: [
    {
      kind: 'script',
      position: 'head',
      importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js',
    },
  ],
};
